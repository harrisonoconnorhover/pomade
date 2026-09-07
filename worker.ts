import { createBackgroundWakeup } from './lib/background-wakeup';
import { salesforceRenewalEnvironment } from '@/lib/salesforce-auth';
import {
  columnResearchEnvironment,
  researchConfiguration,
} from './lib/research-provider';
import { runDueCrmRefreshes } from './db/crm-refresh';
import { runWorkbooks, workbookJobAllowed } from './db/workbook-runner';
import { authorizeDeployment, deploymentStatus } from './lib/deployment';
import { handleCompanion } from './db/companion-handler';
import { companionStatus } from './lib/companion-research';
import { runScheduledCrm } from './db/scheduled-crm';
import { signalStatements } from './db/signal-store';
import app from 'vinext/server/fetch-handler';
import {
  refreshApiSource,
  validateApiSourceRefresh,
  type ApiSourceBatch,
} from './lib/api-source';
import { scheduledTransferStatements } from './db/scheduled-transfer';

import { versionedWorkspaceStatements } from './db/workspace-store';
import { ingestWebhookEvents } from './db/webhook-ingestion';
import { ensureDatabaseSchema } from './db/ensure';
import {
  scheduledColumnIds,
  claimDueSchedule,
  completeClaimedSchedule,
  failClaimedSchedule,
} from './lib/recipe-schedule';
import type { RunReceipt, WorkspaceSnapshot } from './lib/pomade-types';
import { RUN_JOB_LEASE_MS } from './lib/run-job';

const MAX_WORKSPACES_PER_TICK = 3;
const MAX_JOBS_PER_TICK = 3;
let workerSchemaReady = false;

type WorkspaceRecord = {
  id: string;
  snapshot: string;
  updated_at: number;
};

type RunJobRecord = {
  id: string;
  workspace_id: string;
  workbook_run_id: string | null;
  status: string;
  row_ids: string;
  column_ids: string | null;
  resume_column_ids: string | null;
  cursor: number;
  completed_count: number;
  skipped_count: number;
  confirm_external_research: number;
  lease_until: number | null;
  updated_at: number;
};

async function saveWorkspace(
  env: Cloudflare.Env,
  workspace: WorkspaceSnapshot,
) {
  await env.DB.batch(
    await versionedWorkspaceStatements(
      env.DB,
      workspace,
      'Background run queued',
    ),
  );
}

async function claimWorkspace(
  env: Cloudflare.Env,
  record: WorkspaceRecord,
  now: number,
) {
  const workspace = JSON.parse(record.snapshot) as WorkspaceSnapshot;
  const claimed = claimDueSchedule(workspace, now);
  if (!claimed) return null;
  claimed.revision = (workspace.revision ?? 0) + 1;
  const result = await env.DB.prepare(
    `UPDATE workspaces
     SET snapshot = ?, updated_at = ?
     WHERE id = ? AND snapshot = ?`,
  )
    .bind(
      JSON.stringify(claimed),
      claimed.updatedAt,
      record.id,
      record.snapshot,
    )
    .run();
  return result.meta.changes === 1 ? claimed : null;
}

async function scheduledRowIds(workspace: WorkspaceSnapshot) {
  const schedule = workspace.schedule;
  if (!schedule || schedule.target !== 'selected') return undefined;
  const known = new Set(workspace.rows.map((row) => row.id));
  const rowIds = (schedule.rowIds ?? []).filter((rowId) => known.has(rowId));
  if (!rowIds.length) {
    throw new Error('The scheduled rows no longer exist.');
  }
  return rowIds;
}

export async function runDueSchedules(
  scheduledTime: number,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
) {
  const records = await env.DB.prepare(
    `SELECT id, snapshot, updated_at
     FROM workspaces
     ORDER BY updated_at ASC
     LIMIT 50`,
  ).all<WorkspaceRecord>();
  let claimedCount = 0;

  for (const record of records.results) {
    if (claimedCount >= MAX_WORKSPACES_PER_TICK) break;
    let claimed: WorkspaceSnapshot | null = null;
    let latestWorkspace: WorkspaceSnapshot | null = null;
    try {
      claimed = await claimWorkspace(env, record, scheduledTime);
      if (!claimed) continue;
      latestWorkspace = claimed;
      claimedCount += 1;
      // Resolve recipe membership before making any scheduled source requests.
      const columnIds = scheduledColumnIds(claimed);
      const source = claimed.schedule?.beforeRunSource;
      if (source) {
        validateApiSourceRefresh(claimed, source);
        if (claimed.schedule?.target !== 'all')
          throw new Error('Source refresh requires whole-table recipe scope.');
        const fetched = await app.fetch(
          new Request('https://pomade.internal/api/sources/http', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workspaceId: claimed.id,
              config: source.config,
              confirmRequests: true,
            }),
          }),
          env,
          ctx,
        );
        const result = (await fetched.json()) as {
          batch?: ApiSourceBatch;
          error?: string;
        };
        if (!fetched.ok || result.error || !result.batch)
          throw new Error(result.error ?? 'Scheduled source fetch failed.');
        const refreshed = refreshApiSource(
          claimed,
          result.batch,
          source.mapping,
        ).workspace;
        refreshed.schedule!.lastSourceBatchId = result.batch.id;
        await env.DB.batch([
          ...(await versionedWorkspaceStatements(
            env.DB,
            refreshed,
            'Grid edit',
          )),
          ...signalStatements(env.DB, claimed, refreshed, {
            id: result.batch.id,
            origin: 'API refresh',
            columnIds: Object.keys(source.mapping),
          }),
        ]);
        claimed = refreshed;
        latestWorkspace = refreshed;
      }
      const rowIds = await scheduledRowIds(claimed);
      const response = await app.fetch(
        new Request('https://pomade.internal/api/runs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            workspace: claimed,
            rowIds,
            columnIds,
            confirmExternalResearch:
              claimed.schedule?.confirmExternalResearch === true,
          }),
        }),
        env,
        ctx,
      );
      const result = (await response.json()) as {
        workspace?: WorkspaceSnapshot;
        run?: RunReceipt;
        error?: string;
      };
      if (!response.ok || !result.workspace || !result.run) {
        throw new Error(
          result.error || `Scheduled run failed (${response.status}).`,
        );
      }
      latestWorkspace = result.workspace;
      const stepError = result.run.receipts.find(
        (receipt) => receipt.error,
      )?.error;
      if (stepError) throw new Error(stepError);
      const crmPlanIds = await runScheduledCrm(
        env.DB,
        result.workspace,
        rowIds,
        {
          hubSpotAccessToken: env.HUBSPOT_ACCESS_TOKEN,
          salesforceAccessToken: env.SALESFORCE_ACCESS_TOKEN,
          ...salesforceRenewalEnvironment(env),
          salesforceInstanceUrl: env.SALESFORCE_INSTANCE_URL,
          salesforceApiVersion: env.SALESFORCE_API_VERSION,
        },
        async (planId) => {
          const response = await app.fetch(
            new Request('https://pomade.internal/api/crm-sync', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ planId, confirmWrite: true }),
            }),
            env,
            ctx,
          );
          const body = (await response.json()) as {
            plan?: import('./lib/crm-sync').CrmSyncPlan;
            error?: string;
          };
          if (!response.ok || !body.plan)
            throw new Error(body.error || 'Scheduled CRM write failed.');
          return body.plan;
        },
      );
      const transfer = await scheduledTransferStatements(
        env.DB,
        result.workspace,
        rowIds ??
          (claimed.rows.length ? claimed.rows.map((row) => row.id) : undefined),
      );
      const completed = completeClaimedSchedule(
        result.workspace,
        result.run,
        Date.now(),
      );
      completed.schedule!.lastCrmPlanIds = crmPlanIds;
      completed.schedule!.lastTransferRunId = transfer.receiptId;
      completed.schedule!.lastTransferRunIds = transfer.receiptIds;
      await env.DB.batch([
        ...transfer.statements,
        ...(await versionedWorkspaceStatements(
          env.DB,
          completed,
          'Background run queued',
        )),
      ]);
    } catch (error) {
      if (!latestWorkspace) continue;
      const message =
        error instanceof Error ? error.message : 'The scheduled run failed.';
      console.error(
        `Pomade schedule ${latestWorkspace.schedule?.id ?? 'unknown'} failed: ${message}`,
      );
      try {
        await saveWorkspace(
          env,
          failClaimedSchedule(latestWorkspace, message, Date.now()),
        );
      } catch (recoveryError) {
        console.error(
          `Pomade could not persist the failed schedule state: ${
            recoveryError instanceof Error
              ? recoveryError.message
              : 'unknown error'
          }`,
        );
      }
    }
  }
}

async function claimRunJob(
  env: Cloudflare.Env,
  record: RunJobRecord,
  now: number,
) {
  const result = await env.DB.prepare(
    `UPDATE run_jobs
     SET status = 'running', lease_until = ?, updated_at = ?
     WHERE id = ? AND updated_at = ?
       AND (status = 'queued' OR (status = 'running' AND lease_until <= ?))`,
  )
    .bind(now + RUN_JOB_LEASE_MS, now, record.id, record.updated_at, now)
    .run();
  return result.meta.changes === 1;
}

async function finishRunJobStep(
  env: Cloudflare.Env,
  job: RunJobRecord,
  input: { runId?: string; skipped?: boolean },
) {
  const nextCursor = job.cursor + 1;
  const total = (JSON.parse(job.row_ids) as unknown[]).length;
  const nextStatus = nextCursor >= total ? 'completed' : 'queued';
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE run_jobs
     SET cursor = ?, completed_count = completed_count + ?,
         skipped_count = skipped_count + ?,
         status = CASE WHEN status = 'paused' THEN 'paused' ELSE ? END,
         lease_until = NULL, resume_column_ids = NULL, last_run_id = COALESCE(?, last_run_id),
         last_error = NULL, updated_at = ?
     WHERE id = ? AND status IN ('running', 'paused')`,
  )
    .bind(
      nextCursor,
      input.skipped ? 0 : 1,
      input.skipped ? 1 : 0,
      nextStatus,
      input.runId ?? null,
      now,
      job.id,
    )
    .run();
}

async function failRunJob(env: Cloudflare.Env, jobId: string, error: string) {
  await env.DB.prepare(
    `UPDATE run_jobs
     SET status = CASE WHEN status = 'paused' THEN 'paused' ELSE 'failed' END,
         lease_until = NULL, last_error = ?, updated_at = ?
     WHERE id = ? AND status IN ('running', 'paused')`,
  )
    .bind(error.replace(/\s+/g, ' ').trim().slice(0, 500), Date.now(), jobId)
    .run();
}

async function waitForCompanion(
  env: Cloudflare.Env,
  job: RunJobRecord,
  columnIds: string[] | undefined,
  message: string,
  runId?: string,
) {
  await env.DB.prepare(`UPDATE run_jobs SET
    status = CASE WHEN status = 'paused' THEN 'paused' ELSE 'queued' END,
    lease_until = NULL, resume_column_ids = ?, last_error = ?,
    last_run_id = COALESCE(?, last_run_id), updated_at = ?
    WHERE id = ? AND status IN ('running', 'paused')`)
    .bind(
      columnIds ? JSON.stringify(columnIds) : null,
      message,
      runId ?? null,
      Date.now(),
      job.id,
    )
    .run();
}

export async function runQueuedJobs(
  scheduledTime: number,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
) {
  const records = await env.DB.prepare(
    `SELECT id, workspace_id, workbook_run_id, status, row_ids, column_ids, resume_column_ids, cursor,
            completed_count, skipped_count, confirm_external_research,
            lease_until, updated_at
     FROM run_jobs
     WHERE status = 'queued'
        OR (status = 'running' AND lease_until <= ?)
     ORDER BY created_at ASC
     LIMIT ?`,
  )
    .bind(scheduledTime, MAX_JOBS_PER_TICK)
    .all<RunJobRecord>();

  for (const job of records.results) {
    try {
      if (!(await claimRunJob(env, job, scheduledTime))) continue;
      const rowIds = JSON.parse(job.row_ids) as string[];
      const rowId = rowIds[job.cursor];
      if (!rowId) {
        await env.DB.prepare(
          `UPDATE run_jobs
           SET status = 'completed', lease_until = NULL, updated_at = ?
           WHERE id = ? AND status = 'running'`,
        )
          .bind(Date.now(), job.id)
          .run();
        continue;
      }
      const workspaceRecord = await env.DB.prepare(
        'SELECT snapshot FROM workspaces WHERE id = ?',
      )
        .bind(job.workspace_id)
        .first<{ snapshot: string }>();
      if (!workspaceRecord)
        throw new Error('The queued workspace was removed.');
      const workspace = JSON.parse(
        workspaceRecord.snapshot,
      ) as WorkspaceSnapshot;
      if (
        job.workbook_run_id &&
        !(await workbookJobAllowed(env.DB, job.workbook_run_id, workspace))
      ) {
        await env.DB.prepare(
          "UPDATE run_jobs SET status=CASE WHEN EXISTS(SELECT 1 FROM workbook_runs WHERE id=run_jobs.workbook_run_id AND status='cancelled') THEN 'cancelled' ELSE 'paused' END, lease_until=NULL, updated_at=? WHERE id=? AND status='running'",
        )
          .bind(Date.now(), job.id)
          .run();
        continue;
      }
      if (!workspace.rows.some((row) => row.id === rowId)) {
        await finishRunJobStep(env, job, { skipped: true });
        continue;
      }
      const savedColumns = job.resume_column_ids ?? job.column_ids;
      const columnIds = savedColumns
        ? (JSON.parse(savedColumns) as string[])
        : undefined;
      const hasMacResearch =
        env.POMADE_DEPLOYMENT === 'hosted' &&
        workspace.columns.some(
          (column) =>
            column.recipe === 'web-research' &&
            researchConfiguration(columnResearchEnvironment(env, column))
              .provider === 'codex' &&
            (!columnIds || columnIds.includes(column.id)),
        );
      const connection = hasMacResearch ? await companionStatus(env.DB) : null;
      if (
        connection &&
        (!connection.ready ||
          (env.POMADE_CODEX_BROWSER === 'true' && !connection.browserAvailable))
      ) {
        await waitForCompanion(
          env,
          job,
          columnIds,
          'Waiting for your Mac to reconnect.',
        );
        continue;
      }
      const response = await app.fetch(
        new Request('https://pomade.internal/api/runs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            workspace,
            rowIds: [rowId],
            columnIds,
            confirmExternalResearch: job.confirm_external_research === 1,
          }),
        }),
        env,
        ctx,
      );
      const result = (await response.json()) as {
        run?: RunReceipt;
        error?: string;
      };
      if (!response.ok || !result.run) {
        throw new Error(
          result.error || `Background row failed (${response.status}).`,
        );
      }
      const stepError = result.run.receipts.find(
        (receipt) => receipt.error,
      )?.error;
      if (stepError) throw new Error(stepError);
      const pending = result.run.receipts.find((receipt) => receipt.pending);
      if (pending) {
        const scoped = workspace.columns
          .filter(
            (column) =>
              (column.kind === 'formula' || column.kind === 'enrichment') &&
              (!columnIds || columnIds.includes(column.id)),
          )
          .map((column) => column.id);
        await waitForCompanion(
          env,
          job,
          scoped.slice(scoped.indexOf(pending.columnId)),
          'Waiting for research on your Mac.',
          result.run.id,
        );
        continue;
      }
      await finishRunJobStep(env, job, { runId: result.run.id });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The background run failed.';
      console.error(`Pomade background job ${job.id} failed: ${message}`);
      try {
        await failRunJob(env, job.id, message);
      } catch (recoveryError) {
        console.error(
          `Pomade could not persist background job failure: ${
            recoveryError instanceof Error
              ? recoveryError.message
              : 'unknown error'
          }`,
        );
      }
    }
  }
}

async function runBackgroundWork(
  scheduledTime: number,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
) {
  if (!workerSchemaReady && env.POMADE_DEPLOYMENT !== 'hosted') {
    await ensureDatabaseSchema(env.DB);
    workerSchemaReady = true;
  }
  if (deploymentStatus(env).schedulesEnabled) {
    await ingestWebhookEvents(env.DB);
    await runDueSchedules(scheduledTime, env, ctx);
  }
  await runDueCrmRefreshes(
    env.DB,
    {
      hubSpotAccessToken: env.HUBSPOT_ACCESS_TOKEN,
      salesforceAccessToken: env.SALESFORCE_ACCESS_TOKEN,
      ...salesforceRenewalEnvironment(env),
      salesforceInstanceUrl: env.SALESFORCE_INSTANCE_URL,
      salesforceApiVersion: env.SALESFORCE_API_VERSION,
    },
    scheduledTime,
  );
  await runWorkbooks(env.DB, scheduledTime);
  await runQueuedJobs(scheduledTime, env, ctx);
  await runWorkbooks(env.DB);
}

// Sites may not deliver native cron events. Existing owner-page polling and
// the outbound Mac connection also advance due work, without a paid scheduler.
const requestWakeup = createBackgroundWakeup();
function wakeHostedWork(env: Cloudflare.Env, ctx: ExecutionContext) {
  const pending = requestWakeup(() => runBackgroundWork(Date.now(), env, ctx));
  if (pending) ctx.waitUntil(pending);
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const denied = await authorizeDeployment(request, env);
    if (denied) return denied;
    if (
      env.POMADE_DEPLOYMENT === 'hosted' &&
      new URL(request.url).pathname === '/api/companion'
    ) {
      const response = await handleCompanion(request, env.DB);
      if (response.ok) wakeHostedWork(env, ctx);
      return response;
    }
    const response = await app.fetch(request, env, ctx);
    if (
      env.POMADE_DEPLOYMENT === 'hosted' &&
      response.ok &&
      request.method === 'GET' &&
      ['/api/jobs', '/api/workbook-runs', '/api/crm-refresh'].includes(
        new URL(request.url).pathname,
      )
    )
      wakeHostedWork(env, ctx);
    return response;
  },
  scheduled(
    controller: ScheduledController,
    env: Cloudflare.Env,
    ctx: ExecutionContext,
  ) {
    controller.noRetry();
    ctx.waitUntil(runBackgroundWork(controller.scheduledTime, env, ctx));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
