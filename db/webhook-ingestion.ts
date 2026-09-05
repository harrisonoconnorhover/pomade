import type { WorkspaceSnapshot } from '../lib/pomade-types';
import { importWebhookEvents } from '../lib/webhook-inbox';
import { versionedWorkspaceStatements } from './workspace-store';
export async function ingestWebhookEvents(db: D1Database) {
  const pending = await db
    .prepare(
      `SELECT e.id,e.source_id,e.workspace_id,e.records,e.received_at FROM webhook_events e LEFT JOIN webhook_imports i ON i.event_id=e.id JOIN workspaces w ON w.id=e.workspace_id WHERE i.event_id IS NULL AND EXISTS (SELECT 1 FROM json_each(w.snapshot, '$.webhookAutoImport') a WHERE a.key=e.source_id AND a.value=1) ORDER BY e.received_at,e.id LIMIT 100`,
    )
    .all<{
      id: string;
      source_id: string;
      workspace_id: string;
      records: string;
      received_at: number;
    }>();
  let processed = 0;
  for (const e of pending.results) {
    if (processed >= 10) break;
    const record = await db
      .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
      .bind(e.workspace_id)
      .first<{ snapshot: string }>();
    if (!record) continue;
    const workspace = JSON.parse(record.snapshot) as WorkspaceSnapshot;
    if (!workspace.webhookAutoImport?.[e.source_id]) continue;
    if (workspace.schedule?.state === 'running') continue;
    const active = await db
      .prepare(
        "SELECT id FROM run_jobs WHERE workspace_id = ? AND status IN ('queued','running','paused') LIMIT 1",
      )
      .bind(workspace.id)
      .first();
    if (active) continue;
    try {
      const mapping = workspace.webhookMappings?.[e.source_id];
      if (!mapping) throw new Error('Save a field mapping first.');
      const result = importWebhookEvents(
        workspace,
        [
          {
            id: e.id,
            sourceId: e.source_id,
            records: JSON.parse(e.records),
            receivedAt: e.received_at,
          },
        ],
        mapping,
      );
      const statements = await versionedWorkspaceStatements(
        db,
        result.workspace,
        'Grid edit',
      );
      await db.batch([
        ...statements,
        db
          .prepare(
            'INSERT INTO webhook_imports (event_id,imported_at) VALUES (?,?)',
          )
          .bind(e.id, Date.now()),
      ]);
      processed++;
    } catch (error) {
      // Keep the event pending; invalid mappings pause the source for operator correction.
      const latest = await db
        .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
        .bind(workspace.id)
        .first<{ snapshot: string }>();
      if (!latest) continue;
      const fresh = JSON.parse(latest.snapshot) as WorkspaceSnapshot;
      if ((fresh.revision ?? 0) !== (workspace.revision ?? 0)) continue;
      fresh.webhookImportErrors = {
        ...fresh.webhookImportErrors,
        [e.source_id]:
          error instanceof Error ? error.message : 'Import failed.',
      };
      fresh.webhookAutoImport = {
        ...fresh.webhookAutoImport,
        [e.source_id]: false,
      };
      try {
        await db.batch(
          await versionedWorkspaceStatements(db, fresh, 'Grid edit'),
        );
      } catch {
        /* A concurrent edit won; retry on the next tick. */
      }
    }
  }
}
