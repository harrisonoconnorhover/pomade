import {
  readSavedCrmSource,
  applyCrmRefresh,
  refreshInterval,
  type CrmRefreshState,
} from '@/lib/crm-refresh';
import { savedCrmSource } from '@/lib/crm-import';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
import type { CrmSourceOptions } from '@/lib/crm-sources';
import { versionedWorkspaceStatements } from './workspace-store';
import { signalStatements } from './signal-store';

type Record = {
  workspace_id: string;
  state: string;
  status: CrmRefreshState['status'];
  lease_until: number | null;
};
export async function getCrmRefresh(db: D1Database, id: string) {
  const record = await db
    .prepare('SELECT * FROM crm_refreshes WHERE workspace_id=?')
    .bind(id)
    .first<Record>();
  return record
    ? ({
        ...JSON.parse(record.state),
        status: record.status,
      } as CrmRefreshState)
    : null;
}
export async function crmWorkspace(db: D1Database, id: string) {
  const record = await db
    .prepare('SELECT snapshot FROM workspaces WHERE id=?')
    .bind(id)
    .first<{ snapshot: string }>();
  if (!record) throw new Error('The source sheet was removed.');
  return JSON.parse(record.snapshot) as WorkspaceSnapshot;
}
export async function configureCrmRefresh(
  db: D1Database,
  id: string,
  cadence: CrmRefreshState['cadence'],
  maxRecords: number,
) {
  if (
    !['manual', 'every_day', 'every_week'].includes(cadence) ||
    !Number.isInteger(maxRecords) ||
    maxRecords < 1 ||
    maxRecords > 1000
  )
    throw new Error('Choose a refresh interval and 1–1,000 records.');
  const workspace = await crmWorkspace(db, id),
    source = savedCrmSource(workspace);
  if (!source) throw new Error('Import a CRM source first.');
  const existing = await getCrmRefresh(db, id);
  if (existing?.status === 'running')
    throw new Error('Wait for the current refresh to finish.');
  const state: CrmRefreshState = {
    ...existing,
    workspaceId: id,
    source,
    cadence,
    maxRecords,
    status: cadence === 'manual' ? 'paused' : 'idle',
    nextRunAt: refreshInterval(cadence) ? Date.now() + 1_000 : undefined,
    lastError: undefined,
  };
  await db
    .prepare(
      `INSERT INTO crm_refreshes (workspace_id,state,status,next_run_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET state=excluded.state,status=excluded.status,next_run_at=excluded.next_run_at,lease_until=NULL,updated_at=excluded.updated_at WHERE crm_refreshes.status != 'running'`,
    )
    .bind(
      id,
      JSON.stringify(state),
      state.status,
      state.nextRunAt ?? null,
      Date.now(),
    )
    .run();
  return state;
}
export async function refreshCrmWorkspace(
  db: D1Database,
  id: string,
  options: CrmSourceOptions,
  maxRecords?: number,
) {
  let state = await getCrmRefresh(db, id);
  if (!state)
    state = await configureCrmRefresh(db, id, 'manual', maxRecords ?? 500);
  const now = Date.now(),
    lease = now + 120_000;
  const claim = await db
    .prepare(
      `UPDATE crm_refreshes SET status='running',lease_until=?,updated_at=? WHERE workspace_id=? AND (status!='running' OR lease_until<=?)`,
    )
    .bind(lease, now, id, now)
    .run();
  if (!claim.meta.changes)
    throw new Error('This source is already refreshing.');
  try {
    const workspace = await crmWorkspace(db, id);
    if (
      JSON.stringify(savedCrmSource(workspace)) !== JSON.stringify(state.source)
    )
      throw new Error(
        'The saved CRM source changed. Save its refresh settings again.',
      );
    const active = await db
      .prepare(
        "SELECT id FROM run_jobs WHERE workspace_id=? AND status IN ('queued','running','paused') LIMIT 1",
      )
      .bind(id)
      .first();
    const workflow = workspace.workbookPlan
      ? await db
          .prepare(
            "SELECT id FROM workbook_runs WHERE workbook_id=? AND status='running' LIMIT 1",
          )
          .bind(workspace.workbookPlan.id)
          .first()
      : null;
    if (active || workflow || workspace.schedule?.state === 'running')
      throw new Error(
        'A run is using this sheet. Finish or pause it before refreshing.',
      );
    const preview = await readSavedCrmSource(
      workspace,
      maxRecords ?? state.maxRecords,
      options,
    );
    const result = applyCrmRefresh(workspace, preview);
    state = {
      ...state,
      status: state.cadence === 'manual' ? 'paused' : 'idle',
      lastRunAt: Date.now(),
      lastError: undefined,
      summary: result.summary,
      nextRunAt: refreshInterval(state.cadence)
        ? Date.now() + refreshInterval(state.cadence)
        : undefined,
    };
    await db.batch([
      ...(await versionedWorkspaceStatements(
        db,
        result.workspace,
        'Grid edit',
      )),
      ...signalStatements(db, workspace, result.workspace, {
        id: crypto.randomUUID(),
        origin: 'CRM refresh',
        columnIds: result.workspace.columns
          .filter((c) => !c.recipe)
          .map((c) => c.id),
      }),
      db
        .prepare(
          'UPDATE crm_refreshes SET state=?,status=?,next_run_at=?,lease_until=NULL,updated_at=? WHERE workspace_id=? AND lease_until=?',
        )
        .bind(
          JSON.stringify(state),
          state.status,
          state.nextRunAt ?? null,
          Date.now(),
          id,
          lease,
        ),
    ]);
    return { state, workspace: result.workspace };
  } catch (error) {
    state = {
      ...state,
      status: 'failed',
      lastError: error instanceof Error ? error.message : 'CRM refresh failed.',
      nextRunAt: undefined,
    };
    await db
      .prepare(
        "UPDATE crm_refreshes SET state=?,status='failed',next_run_at=NULL,lease_until=NULL,updated_at=? WHERE workspace_id=? AND lease_until=?",
      )
      .bind(JSON.stringify(state), Date.now(), id, lease)
      .run();
    throw error;
  }
}
export async function runDueCrmRefreshes(
  db: D1Database,
  options: CrmSourceOptions,
  now = Date.now(),
) {
  const rows = await db
    .prepare(
      `SELECT workspace_id FROM crm_refreshes WHERE (status='idle' AND next_run_at<=?) OR (status='running' AND lease_until<=?) ORDER BY updated_at ASC LIMIT 3`,
    )
    .bind(now, now)
    .all<{ workspace_id: string }>();
  for (const row of rows.results) {
    try {
      await refreshCrmWorkspace(db, row.workspace_id, options);
    } catch {
      /* Failure is saved for the source panel; no repeated failed requests. */
    }
  }
}
