import type { WorkspaceSnapshot } from '@/lib/pomade-types';
import {
  WORKSPACE_VERSION_LIMIT,
  type WorkspaceVersionReason,
  workspaceContentMatches,
} from '@/lib/workspace-version';

type StoredWorkspace = {
  snapshot: string;
};

export async function versionedWorkspaceStatements(
  db: D1Database,
  workspace: WorkspaceSnapshot,
  reason: WorkspaceVersionReason,
  now = Date.now(),
) {
  const current = await db
    .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
    .bind(workspace.id)
    .first<StoredWorkspace>();
  const statements: D1PreparedStatement[] = [];

  if (current) {
    const previous = JSON.parse(current.snapshot) as WorkspaceSnapshot;
    if ((workspace.revision ?? 0) !== (previous.revision ?? 0))
      throw new Error('Workspace changed; reload before retrying.');
    workspace.revision = (previous.revision ?? 0) + 1;
    if (!workspaceContentMatches(previous, workspace)) {
      statements.push(
        db
          .prepare(`INSERT INTO workspace_versions
            (id, workspace_id, reason, snapshot, created_at)
            VALUES (?, ?, ?, ?, ?)`)
          .bind(
            crypto.randomUUID(),
            workspace.id,
            reason,
            current.snapshot,
            now,
          ),
      );
    }
  }

  statements.push(
    db
      .prepare(`INSERT INTO workspaces (id, name, snapshot, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          snapshot = excluded.snapshot,
          updated_at = excluded.updated_at`)
      .bind(workspace.id, workspace.name, JSON.stringify(workspace), now, now),
  );

  if (current && statements.length > 1) {
    statements.push(
      db
        .prepare(`DELETE FROM workspace_versions
          WHERE workspace_id = ? AND id NOT IN (
            SELECT id FROM workspace_versions
            WHERE workspace_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
          )`)
        .bind(workspace.id, workspace.id, WORKSPACE_VERSION_LIMIT),
    );
  }

  return statements;
}
