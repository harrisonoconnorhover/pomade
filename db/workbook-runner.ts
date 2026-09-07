import { countMaximumExternalActions } from '@/lib/external-recipes';
import {
  createWorkbookRun,
  workbookBatch,
  workbookStepConfigMatches,
  type WorkbookRun,
} from '@/lib/workbook-run';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
import { planTableTransfer } from '@/lib/table-transfer';
import { versionedWorkspaceStatements } from './workspace-store';
import { signalStatements } from './signal-store';

type StoredRun = {
  id: string;
  status: WorkbookRun['status'];
  state: string;
  lease_until: number | null;
};
export async function readWorkbookRun(db: D1Database, workbookId: string) {
  const row = await db
    .prepare(
      'SELECT * FROM workbook_runs WHERE workbook_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .bind(workbookId)
    .first<StoredRun>();
  return row
    ? ({ ...JSON.parse(row.state), status: row.status } as WorkbookRun)
    : null;
}
async function table(db: D1Database, id: string) {
  const row = await db
    .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
    .bind(id)
    .first<{ snapshot: string }>();
  if (!row) throw new Error('A linked sheet was removed.');
  return JSON.parse(row.snapshot) as WorkspaceSnapshot;
}
export async function startWorkbookRun(
  db: D1Database,
  workspaceId: string,
  limits: { maxRows?: number; maxExternalRequests?: number },
) {
  const source = await table(db, workspaceId);
  if (!source.workbookPlan) throw new Error('This sheet has no workbook plan.');
  const tables = await Promise.all(
    source.workbookPlan.tables.map((t) => table(db, t.id)),
  );
  for (const t of tables) {
    const busy = await db
      .prepare(
        "SELECT id FROM run_jobs WHERE workspace_id = ? AND status IN ('queued','running','paused') LIMIT 1",
      )
      .bind(t.id)
      .first();
    if (busy || t.schedule?.state === 'running')
      throw new Error(`${t.name} already has an active run.`);
  }
  const run = createWorkbookRun(tables, { id: crypto.randomUUID(), ...limits });
  await db
    .prepare(
      `INSERT INTO workbook_runs (id, workbook_id, status, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      run.id,
      run.workbookId,
      run.status,
      JSON.stringify(run),
      run.createdAt,
      run.updatedAt,
    )
    .run();
  return run;
}
export async function controlWorkbookRun(
  db: D1Database,
  id: string,
  action: 'pause' | 'resume' | 'cancel',
  maxExternalRequests?: number,
) {
  const row = await db
    .prepare('SELECT * FROM workbook_runs WHERE id = ?')
    .bind(id)
    .first<StoredRun>();
  if (!row) throw new Error('Workbook run not found.');
  const run = JSON.parse(row.state) as WorkbookRun;
  if (['completed', 'cancelled'].includes(row.status))
    throw new Error('This run has finished.');
  const jobId = run.steps[run.cursor]?.jobId;
  const now = Date.now();
  if (action === 'resume') {
    if (row.status !== 'paused' && row.status !== 'needs_attention')
      throw new Error('This run is already running.');
    if (row.lease_until && row.lease_until > now)
      throw new Error('The current step is finishing. Try Resume in a moment.');
    if (maxExternalRequests !== undefined) {
      if (
        !Number.isInteger(maxExternalRequests) ||
        maxExternalRequests < run.reservedRequests ||
        maxExternalRequests > 1000
      )
        throw new Error(
          'Choose a request limit between the amount already reserved and 1,000.',
        );
      run.maxExternalRequests = maxExternalRequests;
    }
    const step = run.steps[run.cursor];
    if (step && !workbookStepConfigMatches(step, await table(db, step.tableId)))
      throw new Error(
        'A recipe or route changed. Restore it or cancel and start a new run.',
      );
    if (jobId && step?.column) {
      const job = await db
        .prepare('SELECT status,cursor,row_ids FROM run_jobs WHERE id=?')
        .bind(jobId)
        .first<{ status: string; cursor: number; row_ids: string }>();
      if (job?.status === 'failed') {
        const rowId = (JSON.parse(job.row_ids) as string[])[job.cursor];
        const source = await table(db, step.tableId);
        const retry = countMaximumExternalActions(
          source.rows.filter((r) => r.id === rowId),
          [step.column],
        );
        if (run.reservedRequests + retry > run.maxExternalRequests)
          throw new Error(
            'Raise the provider request limit to include this retry.',
          );
        run.reservedRequests += retry;
      }
    }
    run.status = 'running';
    run.lastError = undefined;
    const statements = [
      db
        .prepare(
          "UPDATE workbook_runs SET status='running', state=?, updated_at=? WHERE id=? AND status=?",
        )
        .bind(JSON.stringify({ ...run, updatedAt: now }), now, id, row.status),
    ];
    if (jobId)
      statements.push(
        db
          .prepare(
            "UPDATE run_jobs SET status=CASE WHEN lease_until>? THEN 'running' ELSE 'queued' END, lease_until=CASE WHEN lease_until>? THEN lease_until ELSE NULL END, last_error=NULL, updated_at=? WHERE id=? AND status IN ('failed','paused')",
          )
          .bind(now, now, now, jobId),
      );
    await db.batch(statements);
  } else {
    // Do not overwrite a cursor being advanced by the worker. Its next checkpoint preserves this status.
    const status = action === 'pause' ? 'paused' : 'cancelled';
    const statements = [
      db
        .prepare('UPDATE workbook_runs SET status=?, updated_at=? WHERE id=?')
        .bind(status, now, id),
    ];
    if (jobId)
      statements.push(
        db
          .prepare(
            "UPDATE run_jobs SET status=?, last_error=?, updated_at=? WHERE id=? AND status IN ('queued','running','paused','failed')",
          )
          .bind(
            action === 'pause' ? 'paused' : 'cancelled',
            action === 'pause' ? null : 'Workbook run cancelled.',
            now,
            jobId,
          ),
      );
    await db.batch(statements);
    run.status = status;
  }
  return readWorkbookRun(db, run.workbookId);
}
export async function workbookJobAllowed(
  db: D1Database,
  runId: string,
  workspace: WorkspaceSnapshot,
) {
  const row = await db
    .prepare('SELECT status,state FROM workbook_runs WHERE id=?')
    .bind(runId)
    .first<StoredRun>();
  if (!row || row.status !== 'running') return false;
  const run = JSON.parse(row.state) as WorkbookRun;
  if (!workbookStepConfigMatches(run.steps[run.cursor], workspace))
    throw new Error(
      'The workbook recipe changed. Restore it or cancel and start a new run.',
    );
  return true;
}
export async function runWorkbooks(
  db: D1Database,
  now = Date.now(),
  remainingPasses = 4,
) {
  let advanced = false;
  const rows = await db
    .prepare(
      "SELECT * FROM workbook_runs WHERE status='running' AND (lease_until IS NULL OR lease_until <= ?) ORDER BY updated_at ASC LIMIT 3",
    )
    .bind(now)
    .all<StoredRun>();
  for (const row of rows.results) {
    const lease = now + 60_000;
    const claimed = await db
      .prepare(
        "UPDATE workbook_runs SET lease_until=? WHERE id=? AND status='running' AND (lease_until IS NULL OR lease_until<=?)",
      )
      .bind(lease, row.id, now)
      .run();
    if (!claimed.meta.changes) continue;
    let run = JSON.parse(row.state) as WorkbookRun;
    const checkpoint = (extra: D1PreparedStatement[] = []) => {
      run.updatedAt = Date.now();
      return db.batch([
        ...extra,
        db
          .prepare(
            `UPDATE workbook_runs SET state=?, status=CASE WHEN status IN ('paused','cancelled') THEN status ELSE ? END, lease_until=NULL, updated_at=? WHERE id=? AND lease_until=?`,
          )
          .bind(JSON.stringify(run), run.status, run.updatedAt, run.id, lease),
      ]);
    };
    try {
      const step = run.steps[run.cursor];
      if (!step) {
        run.reviewRows = 0;
        for (const [tableId, rowIds] of Object.entries(run.scope)) {
          if (tableId === run.steps[0].tableId) continue;
          const workspace = await table(db, tableId);
          run.reviewRows += workspace.rows.filter(
            (r) => rowIds.includes(r.id) && r.values.status === 'Review',
          ).length;
        }
        run.status = 'completed';
        await checkpoint();
        continue;
      }
      const source = await table(db, step.tableId);
      if (!workbookStepConfigMatches(step, source))
        throw new Error(
          'A recipe or route changed during the run. Restore it or cancel and start a new run.',
        );
      if (step.jobId) {
        const job = await db
          .prepare(
            'SELECT status, row_ids, completed_count, last_error FROM run_jobs WHERE id=?',
          )
          .bind(step.jobId)
          .first<{
            status: string;
            row_ids: string;
            completed_count: number;
            last_error: string | null;
          }>();
        if (!job) throw new Error('The background step was removed.');
        if (job.status === 'failed' || job.status === 'cancelled')
          throw new Error(job.last_error ?? 'The background step failed.');
        if (job.status !== 'completed') {
          await checkpoint();
          continue;
        }
        step.cursor += (JSON.parse(job.row_ids) as string[]).length;
        step.completedRows += job.completed_count;
        step.jobId = undefined;
      }
      step.rowIds ??= [...(run.scope[source.id] ?? [])];
      if (!step.rowIds.length) {
        step.status = 'skipped';
        step.summary = 'No matching rows reached this step.';
        run.cursor++;
        advanced = true;
        await checkpoint();
        continue;
      }
      const busy = await db
        .prepare(
          "SELECT id FROM run_jobs WHERE workspace_id=? AND status IN ('queued','running','paused') LIMIT 1",
        )
        .bind(source.id)
        .first();
      if (busy || source.schedule?.state === 'running')
        throw new Error(
          `${source.name} has another active run. Finish it, then resume this workbook.`,
        );
      if (step.column) {
        if (step.cursor >= step.rowIds.length) {
          step.status = 'completed';
          step.summary = `${step.completedRows} rows processed`;
          run.cursor++;
          advanced = true;
          await checkpoint();
          continue;
        }
        const batch = workbookBatch(run, step, source);
        step.jobId = crypto.randomUUID();
        step.status = 'running';
        run.reservedRequests += batch.requests;
        await checkpoint([
          db
            .prepare(
              `INSERT INTO run_jobs (id,workspace_id,workbook_run_id,status,row_ids,column_ids,cursor,completed_count,skipped_count,confirm_external_research,created_at,updated_at) VALUES (?,?,?,'queued',?,?,0,0,0,1,?,?)`,
            )
            .bind(
              step.jobId,
              source.id,
              run.id,
              JSON.stringify(batch.rowIds),
              JSON.stringify([step.column.id]),
              now,
              now,
            ),
        ]);
      } else if (step.transfer) {
        const target = await table(db, step.transfer.targetTableId);
        const targetBusy = await db
          .prepare(
            "SELECT id FROM run_jobs WHERE workspace_id=? AND status IN ('queued','running','paused') LIMIT 1",
          )
          .bind(target.id)
          .first();
        if (targetBusy || target.schedule?.state === 'running')
          throw new Error(`${target.name} has another active run.`);
        const preview = planTableTransfer(
          source,
          target,
          step.transfer,
          step.rowIds,
        );
        if (preview.review)
          throw new Error(
            `${preview.review} row(s) need a unique match key before routing. Fix the source rows, then resume.`,
          );
        const scoped = [
          ...new Set(
            preview.changes.flatMap((c) =>
              c.targetRowId ? [c.targetRowId] : [],
            ),
          ),
        ];
        if (scoped.length > run.maxRows)
          throw new Error(
            `The route returned ${scoped.length} rows, exceeding the ${run.maxRows}-row run limit.`,
          );
        run.scope[target.id] = scoped;
        step.status = 'completed';
        step.summary = `${preview.added} added · ${preview.updated} updated · ${preview.skipped} unchanged or skipped`;
        run.cursor++;
        advanced = true;
        const receiptId = crypto.randomUUID();
        const receipt = {
          id: receiptId,
          workbookRunId: run.id,
          ruleId: step.transfer.id,
          ruleName: step.transfer.name,
          sourceId: source.id,
          targetId: target.id,
          added: preview.added,
          updated: preview.updated,
          skipped: preview.skipped,
          review: 0,
          changes: preview.changes,
          createdAt: now,
        };
        await checkpoint([
          ...(preview.added || preview.updated
            ? await versionedWorkspaceStatements(
                db,
                preview.target,
                'Grid edit',
              )
            : []),
          ...signalStatements(db, target, preview.target, {
            id: receiptId,
            origin: 'Table transfer',
            columnIds: Object.keys(step.transfer.mapping),
          }),
          db
            .prepare(
              'INSERT INTO table_transfer_runs (id,source_id,target_id,receipt,created_at) VALUES (?,?,?,?,?)',
            )
            .bind(
              receiptId,
              source.id,
              target.id,
              JSON.stringify(receipt),
              now,
            ),
        ]);
      }
    } catch (error) {
      // A failed D1 batch rolls back both the transfer and cursor; retain that same checkpoint.
      run = JSON.parse(row.state) as WorkbookRun;
      run.status = 'needs_attention';
      run.lastError =
        error instanceof Error ? error.message : 'The workbook run failed.';
      await checkpoint();
    }
  }
  if (advanced && remainingPasses > 1)
    await runWorkbooks(db, Date.now(), remainingPasses - 1);
}
