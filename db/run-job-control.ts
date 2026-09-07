import type { RunJob, WorkspaceSnapshot } from '../lib/pomade-types';
import {
  assertScheduledJobScope,
  pauseRecipeSchedule,
} from '../lib/recipe-schedule';
import { versionedWorkspaceStatements } from './workspace-store';

export async function controlRunJob(
  db: D1Database,
  current: RunJob,
  action: 'pause' | 'resume' | 'cancel',
  now = Date.now(),
) {
  const record = current.scheduleExecutionId
    ? await db
        .prepare('SELECT snapshot FROM workspaces WHERE id=?')
        .bind(current.workspaceId)
        .first<{ snapshot: string }>()
    : null;
  const workspace = record
    ? (JSON.parse(record.snapshot) as WorkspaceSnapshot)
    : undefined;
  const matching =
    workspace?.schedule?.executionId === current.scheduleExecutionId &&
    Boolean(current.scheduleExecutionId);
  const postRunOnly =
    matching &&
    current.status === 'completed' &&
    ['failed', 'paused', 'running'].includes(workspace!.schedule!.state);
  if (action === 'resume') {
    if (!['paused', 'failed'].includes(current.status) && !postRunOnly)
      throw new Error('Only a paused or failed run can be resumed.');
    if (current.scheduleExecutionId) {
      if (!matching)
        throw new Error(
          'This schedule was replaced. Cancel the saved run and start a new one.',
        );
      assertScheduledJobScope(workspace!, current.scheduleExecutionId);
    }
    const active = await db
      .prepare(`SELECT id FROM run_jobs
      WHERE workspace_id=? AND id!=? AND status IN ('queued','running','paused') LIMIT 1`)
      .bind(current.workspaceId, current.id)
      .first();
    if (active) throw new Error('Another background run is already active.');
  } else if (
    action === 'pause' &&
    !['queued', 'running'].includes(current.status) &&
    !postRunOnly
  ) {
    throw new Error('Only a queued or running job can be paused.');
  } else if (
    action === 'cancel' &&
    ['completed', 'cancelled'].includes(current.status) &&
    !postRunOnly
  ) {
    throw new Error('This run has already finished.');
  }
  let update: D1PreparedStatement;
  if (action === 'resume') {
    update = db
      .prepare(`UPDATE run_jobs SET status=CASE
        WHEN status='completed' THEN 'completed'
        WHEN lease_until IS NOT NULL AND lease_until>? THEN 'running' ELSE 'queued' END,
      lease_until=CASE WHEN lease_until>? THEN lease_until ELSE NULL END,
      last_error=NULL,updated_at=? WHERE id=? AND status=?`)
      .bind(now, now, now, current.id, current.status);
  } else {
    update = db
      .prepare(`UPDATE run_jobs SET status=?,
      lease_until=CASE WHEN ?='cancelled' THEN NULL ELSE lease_until END,
      waiting_message=CASE WHEN ?='cancelled' THEN NULL ELSE waiting_message END,
      next_check_at=CASE WHEN ?='cancelled' THEN NULL ELSE next_check_at END,
      updated_at=? WHERE id=? AND status=?`)
      .bind(
        action === 'pause'
          ? postRunOnly
            ? 'completed'
            : 'paused'
          : 'cancelled',
        action === 'cancel' ? 'cancelled' : 'paused',
        action === 'cancel' ? 'cancelled' : 'paused',
        action === 'cancel' ? 'cancelled' : 'paused',
        now,
        current.id,
        current.status,
      );
  }
  const statements = [update];
  if (matching && workspace?.schedule) {
    workspace.schedule =
      action === 'resume'
        ? {
            ...workspace.schedule,
            state: 'running',
            enabled: workspace.schedule.cadence !== 'once',
            leaseUntil: undefined,
            lastError: undefined,
            updatedAt: now,
          }
        : pauseRecipeSchedule(workspace.schedule, now);
    workspace.updatedAt = now;
    statements.push(
      ...(await versionedWorkspaceStatements(db, workspace, 'Grid edit', now)),
    );
  }
  const results = await db.batch(statements);
  if (results[0].meta.changes !== 1)
    throw new Error('The run changed. Reload its status and try again.');
  return matching ? workspace : undefined;
}
