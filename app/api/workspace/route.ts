import { ensureDatabase } from '@/db/ensure';
import { versionedWorkspaceStatements } from '@/db/workspace-store';
import { createSampleWorkspace } from '@/lib/sample-workspace';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';

import { DEFAULT_TABLE_ID, isTableId } from '@/lib/workbook';

function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkspaceSnapshot>;
  return (
    isTableId(candidate.id) &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.columns) &&
    candidate.columns.length > 0 &&
    candidate.columns.length <= 100 &&
    Array.isArray(candidate.rows) &&
    candidate.rows.length <= 5_000
  );
}

async function saveWorkspace(workspace: WorkspaceSnapshot) {
  const db = await ensureDatabase();
  const now = Date.now();
  await db.batch(
    await versionedWorkspaceStatements(db, workspace, 'Grid edit', now),
  );
}

export async function GET(request: Request) {
  const tableId =
    new URL(request.url).searchParams.get('workspaceId') ?? DEFAULT_TABLE_ID;
  if (!isTableId(tableId))
    return Response.json({ error: 'Invalid table ID.' }, { status: 400 });
  const db = await ensureDatabase();
  const record = await db
    .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
    .bind(tableId)
    .first<{ snapshot: string }>();

  if (record) {
    return Response.json({ workspace: JSON.parse(record.snapshot) });
  }

  if (tableId !== DEFAULT_TABLE_ID)
    return Response.json({ error: 'Table not found.' }, { status: 404 });
  const workspace = createSampleWorkspace();
  await saveWorkspace(workspace);
  return Response.json({ workspace });
}

export async function PUT(request: Request) {
  const body: unknown = await request.json();
  const workspace = (body as { workspace?: unknown })?.workspace;

  if (!isWorkspaceSnapshot(workspace)) {
    return Response.json(
      { error: 'Invalid workspace payload.' },
      { status: 400 },
    );
  }

  const requestedId =
    new URL(request.url).searchParams.get('workspaceId') ?? DEFAULT_TABLE_ID;
  if (requestedId !== workspace.id)
    return Response.json({ error: 'Table ID mismatch.' }, { status: 400 });
  const db = await ensureDatabase();
  const exists = await db
    .prepare('SELECT id FROM workspaces WHERE id = ?')
    .bind(workspace.id)
    .first();
  if (!exists)
    return Response.json({ error: 'Table not found.' }, { status: 404 });
  const updated = { ...workspace, updatedAt: Date.now() };
  await saveWorkspace(updated);
  return Response.json({ workspace: updated });
}
