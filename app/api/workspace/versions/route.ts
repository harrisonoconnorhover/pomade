import { ensureDatabase } from '@/db/ensure';
import { versionedWorkspaceStatements } from '@/db/workspace-store';
import type { RunJobStatus, WorkspaceSnapshot } from '@/lib/pomade-types';
import {
  prepareRestoredWorkspace,
  summarizeWorkspaceVersion,
} from '@/lib/workspace-version';

import { DEFAULT_TABLE_ID, isTableId } from '@/lib/workbook';

type VersionRecord = {
  id: string;
  reason: string;
  snapshot: string;
  created_at: number;
};

function isVersionId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}

export async function GET(request: Request) {
  const tableId =
    new URL(request.url).searchParams.get('workspaceId') ?? DEFAULT_TABLE_ID;
  if (!isTableId(tableId))
    return Response.json({ error: 'Invalid table ID.' }, { status: 400 });
  const db = await ensureDatabase();
  const result = await db
    .prepare(`SELECT id, reason, snapshot, created_at
      FROM workspace_versions
      WHERE workspace_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 20`)
    .bind(tableId)
    .all<VersionRecord>();

  return Response.json({
    versions: result.results.flatMap((record) => {
      try {
        const workspace = JSON.parse(record.snapshot) as WorkspaceSnapshot;
        return [
          summarizeWorkspaceVersion(
            record.id,
            record.reason,
            record.created_at,
            workspace,
          ),
        ];
      } catch {
        return [];
      }
    }),
  });
}

export async function POST(request: Request) {
  const tableId =
    new URL(request.url).searchParams.get('workspaceId') ?? DEFAULT_TABLE_ID;
  if (!isTableId(tableId))
    return Response.json({ error: 'Invalid table ID.' }, { status: 400 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Send a JSON version request.' },
      { status: 400 },
    );
  }
  const versionId = (body as { versionId?: unknown })?.versionId;
  if (!isVersionId(versionId)) {
    return Response.json(
      { error: 'Choose a valid workspace version.' },
      { status: 400 },
    );
  }

  const db = await ensureDatabase();
  const activeJob = await db
    .prepare(`SELECT status FROM run_jobs
      WHERE workspace_id = ? AND status IN ('queued', 'running', 'paused')
      LIMIT 1`)
    .bind(tableId)
    .first<{ status: RunJobStatus }>();
  if (activeJob) {
    return Response.json(
      { error: 'Finish the active background run before restoring a version.' },
      { status: 409 },
    );
  }

  const record = await db
    .prepare(`SELECT snapshot FROM workspace_versions
      WHERE id = ? AND workspace_id = ?`)
    .bind(versionId, tableId)
    .first<{ snapshot: string }>();
  if (!record) {
    return Response.json(
      { error: 'That workspace version no longer exists.' },
      { status: 404 },
    );
  }

  try {
    const stored = JSON.parse(record.snapshot) as WorkspaceSnapshot;
    if (stored.id !== tableId) throw new Error('Workspace mismatch');
    const restored = prepareRestoredWorkspace(stored, Date.now());
    await db.batch(
      await versionedWorkspaceStatements(
        db,
        restored,
        'Version restore',
        restored.updatedAt,
      ),
    );
    return Response.json({ workspace: restored });
  } catch {
    return Response.json(
      { error: 'That workspace version could not be restored.' },
      { status: 422 },
    );
  }
}
