import { withEnv } from 'cloudflare:workers';
import {
  accountsEnabled,
  accountEnvironment,
  resolveAccount,
  AccountError,
  type PomadeAccount,
} from './db/accounts';
import { handleAccount } from './db/account-handler';
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
import app from 'vinext/server/fetch-handler';
import { ingestWebhookEvents } from './db/webhook-ingestion';
import { ensureDatabaseSchema } from './db/ensure';
import { advanceRecipeSchedules } from './db/schedule-runner';
import { assertScheduledJobScope } from './lib/recipe-schedule';
import type { RunReceipt, WorkspaceSnapshot } from './lib/pomade-types';
import { RUN_JOB_LEASE_MS } from './lib/run-job';

const MAX_JOBS_PER_TICK = 3;
let workerSchemaReady = false;
type RunJobRecord = {
  id: string;
  workspace_id: string;
  workbook_run_id: string | null;
  schedule_execution_id: string | null;
  next_check_at: number | null;
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
export async function runDueSchedules(
  scheduledTime: number,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
) {
  await advanceRecipeSchedules(
    env.DB,
    scheduledTime,
    (path, body) =>
      app.fetch(
        new Request(`https://pomade.internal${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        env,
        ctx,
      ),
    {
      hubSpotAccessToken: env.HUBSPOT_ACCESS_TOKEN,
      salesforceAccessToken: env.SALESFORCE_ACCESS_TOKEN,
      ...salesforceRenewalEnvironment(env),
      salesforceInstanceUrl: env.SALESFORCE_INSTANCE_URL,
      salesforceApiVersion: env.SALESFORCE_API_VERSION,
    },
  );
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
         last_error = NULL, waiting_message = NULL, next_check_at = NULL, updated_at = ?
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

async function failRunJob(
  env: Cloudflare.Env,
  jobId: string,
  error: string,
  checkpoint?: { columnIds?: string[]; runId?: string; nextCheckAt?: number },
) {
  await env.DB.prepare(
    `UPDATE run_jobs
     SET status = CASE WHEN status = 'paused' THEN 'paused' ELSE 'failed' END,
         lease_until = NULL, last_error = ?, waiting_message = NULL, updated_at = ?,
         resume_column_ids = COALESCE(?,resume_column_ids), last_run_id = COALESCE(?,last_run_id), next_check_at = ?
     WHERE id = ? AND status IN ('running', 'paused')`,
  )
    .bind(
      error.replace(/\s+/g, ' ').trim().slice(0, 500),
      Date.now(),
      checkpoint?.columnIds ? JSON.stringify(checkpoint.columnIds) : null,
      checkpoint?.runId ?? null,
      checkpoint?.nextCheckAt ?? null,
      jobId,
    )
    .run();
}

async function waitForExternalResult(
  env: Cloudflare.Env,
  job: RunJobRecord,
  columnIds: string[] | undefined,
  message: string,
  runId?: string,
  nextCheckAt?: number,
) {
  await env.DB.prepare(`UPDATE run_jobs SET
    status = CASE WHEN status = 'paused' THEN 'paused' ELSE 'queued' END,
    lease_until = NULL, resume_column_ids = ?, waiting_message = ?, last_error = NULL, next_check_at = ?,
    last_run_id = COALESCE(?, last_run_id), updated_at = ?
    WHERE id = ? AND status IN ('running', 'paused')`)
    .bind(
      columnIds ? JSON.stringify(columnIds) : null,
      message,
      nextCheckAt ?? Date.now() + 15_000,
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
    `SELECT id, workspace_id, workbook_run_id, schedule_execution_id, next_check_at, status, row_ids, column_ids, resume_column_ids, cursor,
            completed_count, skipped_count, confirm_external_research,
            lease_until, updated_at
     FROM run_jobs
     WHERE (status = 'queued' AND (next_check_at IS NULL OR next_check_at <= ?))
        OR (status = 'running' AND lease_until <= ?)
     ORDER BY created_at ASC
     LIMIT ?`,
  )
    .bind(scheduledTime, scheduledTime, MAX_JOBS_PER_TICK)
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
      if (job.schedule_execution_id) {
        if (
          workspace.schedule?.executionId !== job.schedule_execution_id ||
          workspace.schedule?.state !== 'running'
        ) {
          await env.DB.prepare(
            "UPDATE run_jobs SET status=?,lease_until=NULL,updated_at=? WHERE id=? AND status='running'",
          )
            .bind(
              workspace.schedule?.executionId === job.schedule_execution_id
                ? 'paused'
                : 'cancelled',
              Date.now(),
              job.id,
            )
            .run();
          continue;
        }
        assertScheduledJobScope(workspace, job.schedule_execution_id);
      }
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
        await waitForExternalResult(
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
            executionId: job.id,
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
      const scoped = workspace.columns
        .filter(
          (column) =>
            (column.kind === 'formula' || column.kind === 'enrichment') &&
            (!columnIds || columnIds.includes(column.id)),
        )
        .map((column) => column.id);
      const problem = result.run.receipts.find(
        (receipt) => receipt.error || receipt.pending,
      );
      if (problem) {
        const remaining = scoped.slice(
          Math.max(0, scoped.indexOf(problem.columnId)),
        );
        if (problem.error)
          await failRunJob(env, job.id, problem.error, {
            columnIds: remaining,
            runId: result.run.id,
            nextCheckAt: problem.nextCheckAt,
          });
        else
          await waitForExternalResult(
            env,
            job,
            remaining,
            problem.evidence?.at(-1) || 'Waiting for an external result.',
            result.run.id,
            problem.nextCheckAt,
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
const requestWakeups = new Map<
  string,
  ReturnType<typeof createBackgroundWakeup>
>();
function wakeHostedWork(env: Cloudflare.Env, ctx: ExecutionContext) {
  const id = env.POMADE_ACCOUNT_ID ?? 'local';
  const requestWakeup = requestWakeups.get(id) ?? createBackgroundWakeup();
  requestWakeups.set(id, requestWakeup);
  const pending = requestWakeup(
    () =>
      withEnv(env, () =>
        runBackgroundWork(Date.now(), env, ctx),
      ) as Promise<void>,
  );
  if (pending) ctx.waitUntil(pending);
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    if (accountsEnabled(env)) {
      try {
        const account = await resolveAccount(request, env);
        const scoped = await accountEnvironment(env, account);
        return privateResponse(
          (await withEnv(scoped, async () => {
            if (new URL(request.url).pathname === '/api/account')
              return handleAccount(request, env, account);
            return dispatchRequest(request, scoped, ctx);
          })) as Response,
        );
      } catch (error) {
        if (!(error instanceof AccountError))
          console.error('Pomade account request failed.');
        return privateResponse(
          Response.json(
            {
              error:
                error instanceof AccountError
                  ? error.message
                  : 'Account request failed. Please try again.',
            },
            { status: error instanceof AccountError ? error.status : 503 },
          ),
        );
      }
    }
    const denied = await authorizeDeployment(request, env);
    if (denied) return denied;
    if (new URL(request.url).pathname === '/api/account')
      return privateResponse(Response.json({ enabled: false }));
    return dispatchRequest(request, env, ctx);
  },
  scheduled(
    controller: ScheduledController,
    env: Cloudflare.Env,
    ctx: ExecutionContext,
  ) {
    controller.noRetry();
    ctx.waitUntil(
      (async () => {
        if (!accountsEnabled(env))
          return runBackgroundWork(controller.scheduledTime, env, ctx);
        const accounts = await env.DB.prepare(
          "SELECT * FROM pomade_accounts WHERE status='active'",
        ).all<PomadeAccount>();
        for (const account of accounts.results) {
          try {
            const scoped = await accountEnvironment(env, account);
            await withEnv(scoped, () =>
              runBackgroundWork(controller.scheduledTime, scoped, ctx),
            );
          } catch {
            console.error('Account background work failed.');
          }
        }
      })(),
    );
  },
} satisfies ExportedHandler<Cloudflare.Env>;

function privateResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Vary', 'Cookie, oai-authenticated-user-id');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
async function dispatchRequest(
  request: Request,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
) {
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
}
