import { versionedWorkspaceStatements } from './workspace-store';
import { planTableTransfer } from '../lib/table-transfer';
import type { WorkspaceSnapshot } from '../lib/pomade-types';

/** Statements are committed with source schedule completion in one D1 batch. */
export async function scheduledTransferStatements(
  db: D1Database,
  source: WorkspaceSnapshot,
  rowIds?: string[],
) {
  const rule = source.schedule?.afterRunTransfer;
  if (!rule)
    return { statements: [] as D1PreparedStatement[], receiptId: undefined };
  const record = await db
    .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
    .bind(rule.targetTableId)
    .first<{ snapshot: string }>();
  if (!record)
    throw new Error('Scheduled transfer destination no longer exists.');
  const target = JSON.parse(record.snapshot) as WorkspaceSnapshot;
  const active = await db
    .prepare(
      "SELECT id FROM run_jobs WHERE workspace_id = ? AND status IN ('queued','running','paused') LIMIT 1",
    )
    .bind(target.id)
    .first();
  if (active || target.schedule?.state === 'running')
    throw new Error(
      'Scheduled transfer destination has active background work.',
    );
  const plan = planTableTransfer(source, target, rule, rowIds);
  if (plan.review)
    throw new Error(
      `Scheduled transfer stopped: ${plan.review} rows need match-key review. No destination changes applied.`,
    );
  const { target: updatedTarget, changes, ...counts } = plan;
  const keys = [rule.targetKey, ...Object.keys(rule.mapping)];
  const compact = (values?: Record<string, string>) =>
    values
      ? Object.fromEntries(
          keys.map((k) => [k, (values[k] ?? '').slice(0, 500)]),
        )
      : undefined;
  const id = crypto.randomUUID(),
    now = Date.now();
  const receipt = {
    id,
    sourceId: source.id,
    targetId: target.id,
    ruleId: rule.id,
    ruleName: rule.name,
    rule: structuredClone(rule),
    scheduleId: source.schedule!.id,
    createdAt: now,
    ...counts,
    detailsLimited: changes.length > 100,
    changes: changes
      .slice(0, 100)
      .map((c) => ({
        ...c,
        before: compact(c.before),
        after: compact(c.after),
      })),
  };
  const statements =
    plan.added || plan.updated
      ? await versionedWorkspaceStatements(db, updatedTarget, 'Grid edit')
      : [];
  statements.push(
    db
      .prepare(
        'INSERT INTO table_transfer_runs (id,source_id,target_id,receipt,created_at) VALUES (?,?,?,?,?)',
      )
      .bind(id, source.id, target.id, JSON.stringify(receipt), now),
  );
  return { statements, receiptId: id };
}
