import {
  claimDueSchedule,
  completeClaimedSchedule,
  failClaimedSchedule,
  isScheduleDue,
  scheduledColumnIds,
  scheduleExecutionFingerprint,
  assertScheduledJobScope,
} from '../lib/recipe-schedule';
import { countMaximumExternalActions } from '../lib/external-recipes';
import {
  createRunJob,
  MAX_BACKGROUND_RESEARCH_ACTIONS,
  MAX_BACKGROUND_ROWS,
} from '../lib/run-job';
import {
  refreshApiSource,
  validateApiSourceRefresh,
  type ApiSourceBatch,
} from '../lib/api-source';
import type { WorkspaceSnapshot } from '../lib/pomade-types';
import type { CrmSourceOptions } from '../lib/crm-sources';
import type { CrmSyncPlan } from '../lib/crm-sync';
import { versionedWorkspaceStatements } from './workspace-store';
import { signalStatements } from './signal-store';
import { scheduledTransferStatements } from './scheduled-transfer';
import { runScheduledCrm } from './scheduled-crm';

type StoredJob = {
  id: string;
  status: string;
  row_ids: string;
  last_run_id: string | null;
  last_error: string | null;
};
type CallApi = (path: string, body: object) => Promise<Response>;
function scheduleRows(workspace: WorkspaceSnapshot) {
  const known = new Set(workspace.rows.map((row) => row.id));
  if (workspace.schedule?.target !== 'selected') return [...known];
  const rows = (workspace.schedule.rowIds ?? []).filter((id) => known.has(id));
  if (!rows.length) throw new Error('The scheduled rows no longer exist.');
  return rows;
}
function checkScope(workspace: WorkspaceSnapshot, extraRows = 0) {
  const ids = scheduledColumnIds(workspace);
  const columns = workspace.columns.filter(
    (c) =>
      (c.kind === 'formula' || c.kind === 'enrichment') &&
      (!ids || ids.includes(c.id)),
  );
  if (!columns.length) throw new Error('This schedule has no recipe columns.');
  const target = new Set(scheduleRows(workspace));
  const rows = [
    ...workspace.rows.filter((row) => target.has(row.id)),
    ...Array.from({ length: extraRows }, (_, i) => ({
      id: `future-${i}`,
      values: {},
    })),
  ];
  if (
    rows.length > MAX_BACKGROUND_ROWS ||
    countMaximumExternalActions(rows, columns) >
      MAX_BACKGROUND_RESEARCH_ACTIONS ||
    rows.some((row) => countMaximumExternalActions([row], columns) > 10)
  )
    throw new Error(
      'Narrow this schedule to at most 100 rows, 50 provider submissions and 10 per row, including possible source additions and verifications.',
    );
  if (
    countMaximumExternalActions(rows, columns) &&
    !workspace.schedule?.confirmExternalResearch
  )
    throw new Error('Confirm the scheduled provider requests first.');
  return { rowIds: [...target], columnIds: columns.map((c) => c.id) };
}

export async function advanceRecipeSchedules(
  db: D1Database,
  now: number,
  call: CallApi,
  crmOptions: CrmSourceOptions,
) {
  const records = await db
    .prepare(
      'SELECT id, snapshot FROM workspaces ORDER BY updated_at ASC LIMIT 50',
    )
    .all<{ id: string; snapshot: string }>();
  let claimedCount = 0;
  for (const record of records.results) {
    if (claimedCount >= 3) break;
    let workspace = JSON.parse(record.snapshot) as WorkspaceSnapshot;
    let claimedExecution: string | undefined;
    try {
      if (!isScheduleDue(workspace.schedule, now)) continue;
      let job: StoredJob | null = null;
      if (workspace.schedule?.state === 'running' && workspace.schedule.jobId) {
        job = await db
          .prepare(
            'SELECT id,status,row_ids,last_run_id,last_error FROM run_jobs WHERE id=?',
          )
          .bind(workspace.schedule.jobId)
          .first<StoredJob>();
        if (job && ['queued', 'running', 'paused'].includes(job.status))
          continue;
      } else {
        const busy = await db
          .prepare(
            "SELECT id FROM run_jobs WHERE workspace_id=? AND status IN ('queued','running','paused') LIMIT 1",
          )
          .bind(workspace.id)
          .first();
        if (busy) continue;
      }
      const claimed = claimDueSchedule(workspace, now);
      if (!claimed) continue;
      claimed.revision = (workspace.revision ?? 0) + 1;
      const claim = await db
        .prepare(
          'UPDATE workspaces SET snapshot=?,updated_at=? WHERE id=? AND snapshot=?',
        )
        .bind(JSON.stringify(claimed), now, workspace.id, record.snapshot)
        .run();
      if (claim.meta.changes !== 1) continue;
      workspace = claimed;
      claimedExecution = claimed.schedule!.executionId;
      claimedCount++;
      if (workspace.schedule!.jobId) {
        if (!job)
          throw new Error(
            'The scheduled background job is missing. Save a new schedule.',
          );
        if (job.status !== 'completed')
          throw new Error(
            job.last_error ||
              'Scheduled work stopped. Resume its background run to continue the saved lookups.',
          );
        assertScheduledJobScope(workspace, claimedExecution!);
        const rowIds = JSON.parse(job.row_ids) as string[];
        const crmPlanIds = await runScheduledCrm(
          db,
          workspace,
          rowIds,
          crmOptions,
          async (planId) => {
            const response = await call('/api/crm-sync', {
              planId,
              confirmWrite: true,
            });
            const result = (await response.json()) as {
              plan?: CrmSyncPlan;
              error?: string;
            };
            if (!response.ok || !result.plan)
              throw new Error(result.error || 'Scheduled CRM write failed.');
            return result.plan;
          },
        );
        const transfer = await scheduledTransferStatements(
          db,
          workspace,
          rowIds,
        );
        const completed = completeClaimedSchedule(
          workspace,
          job.last_run_id ? { id: job.last_run_id } : undefined,
        );
        completed.schedule!.lastCrmPlanIds = crmPlanIds;
        completed.schedule!.lastTransferRunId = transfer.receiptId;
        completed.schedule!.lastTransferRunIds = transfer.receiptIds;
        await db.batch([
          ...transfer.statements,
          db
            .prepare('UPDATE run_jobs SET updated_at=? WHERE id=?')
            .bind(Date.now(), job.id),
          ...(await versionedWorkspaceStatements(
            db,
            completed,
            'Background run queued',
          )),
        ]);
        continue;
      }
      const source = workspace.schedule!.beforeRunSource;
      checkScope(
        workspace,
        source && workspace.schedule!.sourceExecutionId !== claimedExecution
          ? source.config.maxRows
          : 0,
      );
      if (
        source &&
        workspace.schedule!.sourceExecutionId !== claimedExecution
      ) {
        validateApiSourceRefresh(workspace, source);
        if (workspace.schedule!.target !== 'all')
          throw new Error('Source refresh requires whole-table scope.');
        const response = await call('/api/sources/http', {
          workspaceId: workspace.id,
          config: source.config,
          confirmRequests: true,
        });
        const result = (await response.json()) as {
          batch?: ApiSourceBatch;
          error?: string;
        };
        if (!response.ok || !result.batch)
          throw new Error(result.error || 'Scheduled source fetch failed.');
        const refreshed = refreshApiSource(
          workspace,
          result.batch,
          source.mapping,
        ).workspace;
        refreshed.schedule!.lastSourceBatchId = result.batch.id;
        refreshed.schedule!.sourceExecutionId = claimedExecution;
        await db.batch([
          ...(await versionedWorkspaceStatements(db, refreshed, 'Grid edit')),
          ...signalStatements(db, workspace, refreshed, {
            id: result.batch.id,
            origin: 'API refresh',
            columnIds: Object.keys(source.mapping),
          }),
        ]);
        workspace = refreshed;
      }
      const scope = checkScope(workspace);
      const id = `scheduled-${claimedExecution}`;
      const queued = scope.rowIds.length
        ? createRunJob({
            id,
            workspaceId: workspace.id,
            ...scope,
            confirmExternalResearch:
              workspace.schedule!.confirmExternalResearch,
          })
        : null;
      workspace.schedule = {
        ...workspace.schedule!,
        jobId: id,
        executionFingerprint: scheduleExecutionFingerprint(workspace),
        leaseUntil: undefined,
      };
      await db.batch([
        db
          .prepare(`INSERT OR IGNORE INTO run_jobs
          (id,workspace_id,status,row_ids,column_ids,schedule_execution_id,cursor,completed_count,skipped_count,confirm_external_research,created_at,updated_at)
          VALUES (?,?,?,?,?,?,0,0,0,?,?,?)`)
          .bind(
            id,
            workspace.id,
            queued ? 'queued' : 'completed',
            JSON.stringify(scope.rowIds),
            JSON.stringify(scope.columnIds),
            claimedExecution,
            workspace.schedule.confirmExternalResearch ? 1 : 0,
            now,
            now,
          ),
        ...(await versionedWorkspaceStatements(
          db,
          workspace,
          'Background run queued',
        )),
      ]);
    } catch (error) {
      if (!claimedExecution) continue;
      const latest = await db
        .prepare('SELECT snapshot FROM workspaces WHERE id=?')
        .bind(record.id)
        .first<{ snapshot: string }>();
      if (!latest) continue;
      const current = JSON.parse(latest.snapshot) as WorkspaceSnapshot;
      if (
        current.schedule?.executionId !== claimedExecution ||
        current.schedule.state === 'paused'
      )
        continue;
      const failed = failClaimedSchedule(
        current,
        error instanceof Error ? error.message : 'Scheduled work failed.',
      );
      await db.batch([
        ...(await versionedWorkspaceStatements(
          db,
          failed,
          'Background run queued',
        )),
        ...(current.schedule.jobId
          ? [
              db
                .prepare('UPDATE run_jobs SET updated_at=? WHERE id=?')
                .bind(Date.now(), current.schedule.jobId),
            ]
          : []),
      ]);
    }
  }
}
