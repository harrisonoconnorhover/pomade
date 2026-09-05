import { detectSignalChanges, type SignalBatch } from '../lib/change-signals';
import type { WorkspaceSnapshot } from '../lib/pomade-types';
export function signalStatements(
  db: D1Database,
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot,
  options: Parameters<typeof detectSignalChanges>[2],
) {
  const batch = detectSignalChanges(before, after, options);
  return signalBatchStatements(db, batch);
}
export function signalBatchStatements(
  db: D1Database,
  batch: SignalBatch | null,
) {
  return batch
    ? [
        db
          .prepare(
            'INSERT INTO signal_batches (id,workspace_id,batch,created_at,reviewed_at) VALUES (?,?,?,?,NULL)',
          )
          .bind(
            batch.id,
            batch.workspaceId,
            JSON.stringify(batch),
            batch.createdAt,
          ),
      ]
    : [];
}
