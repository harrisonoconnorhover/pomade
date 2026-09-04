import { ensureDatabase } from '@/db/ensure';
import { createSampleWorkspace } from '@/lib/sample-workspace';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';

const WORKSPACE_ID = 'founder-targets';

function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkspaceSnapshot>;
  return (
    candidate.id === WORKSPACE_ID &&
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
  await db
    .prepare(`INSERT INTO workspaces (id, name, snapshot, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        snapshot = excluded.snapshot,
        updated_at = excluded.updated_at`)
    .bind(workspace.id, workspace.name, JSON.stringify(workspace), now, now)
    .run();
}

export async function GET() {
  const db = await ensureDatabase();
  const record = await db
    .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
    .bind(WORKSPACE_ID)
    .first<{ snapshot: string }>();

  if (record) {
    return Response.json({ workspace: JSON.parse(record.snapshot) });
  }

  const workspace = createSampleWorkspace();
  await saveWorkspace(workspace);
  return Response.json({ workspace });
}

export async function PUT(request: Request) {
  const body: unknown = await request.json();
  const workspace = (body as { workspace?: unknown })?.workspace;

  if (!isWorkspaceSnapshot(workspace)) {
    return Response.json({ error: 'Invalid workspace payload.' }, { status: 400 });
  }

  const updated = { ...workspace, updatedAt: Date.now() };
  await saveWorkspace(updated);
  return Response.json({ workspace: updated });
}
