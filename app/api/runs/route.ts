import { ensureDatabase } from '@/db/ensure';
import { executeWorkspace } from '@/lib/local-recipe-engine';
import type { RunReceipt, WorkspaceSnapshot } from '@/lib/pomade-types';

function hasRunnableWorkspace(value: unknown): value is WorkspaceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const workspace = value as Partial<WorkspaceSnapshot>;
  return (
    typeof workspace.id === 'string' &&
    Array.isArray(workspace.columns) &&
    workspace.columns.length > 0 &&
    workspace.columns.length <= 100 &&
    Array.isArray(workspace.rows) &&
    workspace.rows.length > 0 &&
    workspace.rows.length <= 5_000
  );
}

export async function GET(request: Request) {
  const workspaceId =
    new URL(request.url).searchParams.get('workspaceId') ?? 'founder-targets';
  const db = await ensureDatabase();
  const result = await db
    .prepare(
      'SELECT receipt FROM runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 10',
    )
    .bind(workspaceId)
    .all<{ receipt: string }>();

  return Response.json({
    runs: result.results.map(
      (record) => JSON.parse(record.receipt) as RunReceipt,
    ),
  });
}

export async function POST(request: Request) {
  const body: unknown = await request.json();
  const workspace = (body as { workspace?: unknown })?.workspace;
  const requestedRowIds = (body as { rowIds?: unknown })?.rowIds;

  if (!hasRunnableWorkspace(workspace)) {
    return Response.json(
      { error: 'A non-empty workspace is required.' },
      { status: 400 },
    );
  }

  if (
    requestedRowIds !== undefined &&
    (!Array.isArray(requestedRowIds) ||
      requestedRowIds.length === 0 ||
      requestedRowIds.length > workspace.rows.length ||
      requestedRowIds.some((rowId) => typeof rowId !== 'string'))
  ) {
    return Response.json(
      { error: 'Select one or more valid rows to run.' },
      { status: 400 },
    );
  }

  const rowIds = requestedRowIds as string[] | undefined;
  const knownRows = new Set(workspace.rows.map((row) => row.id));
  if (rowIds?.some((rowId) => !knownRows.has(rowId))) {
    return Response.json(
      { error: 'One or more selected rows no longer exist.' },
      { status: 409 },
    );
  }

  const { workspace: updated, run } = executeWorkspace(workspace, rowIds);
  const db = await ensureDatabase();
  const now = Date.now();

  await db.batch([
    db
      .prepare(`INSERT INTO workspaces (id, name, snapshot, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          snapshot = excluded.snapshot,
          updated_at = excluded.updated_at`)
      .bind(updated.id, updated.name, JSON.stringify(updated), now, now),
    db
      .prepare(`INSERT INTO runs
        (id, workspace_id, status, row_count, action_count, receipt, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        run.id,
        run.workspaceId,
        run.status,
        run.rowCount,
        run.actionCount,
        JSON.stringify(run),
        run.finishedAt,
      ),
  ]);

  return Response.json({ workspace: updated, run });
}
