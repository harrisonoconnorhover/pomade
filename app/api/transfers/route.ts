import { signalStatements } from '@/db/signal-store';
import { ensureDatabase } from '@/db/ensure';
import { versionedWorkspaceStatements } from '@/db/workspace-store';
import { planTableTransfer } from '@/lib/table-transfer';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sourceId: string;
      ruleId: string;
      rowIds?: string[];
      apply?: boolean;
      sourceRevision?: number;
      targetRevision?: number;
    };
    const db = await ensureDatabase();
    const load = async (id: string) => {
      const record = await db
        .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
        .bind(id)
        .first<{ snapshot: string }>();
      if (!record) throw new Error('Table not found.');
      return JSON.parse(record.snapshot) as WorkspaceSnapshot;
    };
    const source = await load(body.sourceId);
    const rule = source.tableTransfers?.find((r) => r.id === body.ruleId);
    if (!rule) throw new Error('Save this transfer rule before previewing.');
    const target = await load(rule.targetTableId);
    const active = await db
      .prepare(
        "SELECT id FROM run_jobs WHERE workspace_id = ? AND status IN ('queued','running','paused') LIMIT 1",
      )
      .bind(target.id)
      .first();
    if (active || target.schedule?.state === 'running')
      throw new Error(
        'The destination has active background work. Finish or cancel it before transferring.',
      );
    const plan = planTableTransfer(source, target, rule, body.rowIds);
    const { target: updatedTarget, changes, ...counts } = plan;
    const keys = [rule.targetKey, ...Object.keys(rule.mapping)];
    const compact = (values?: Record<string, string>) =>
      values
        ? Object.fromEntries(
            keys.map((k) => [k, (values[k] ?? '').slice(0, 500)]),
          )
        : undefined;
    const preview = {
      ...counts,
      detailsLimited: changes.length > 100,
      changes: changes.slice(0, 100).map((c) => ({
        ...c,
        before: compact(c.before),
        after: compact(c.after),
      })),
    };
    if (body.apply !== true) return Response.json({ preview });
    if (
      body.sourceRevision !== plan.sourceRevision ||
      body.targetRevision !== plan.targetRevision
    )
      return Response.json(
        {
          error:
            'A table changed since this preview. Preview again before applying.',
        },
        { status: 409 },
      );
    const id = crypto.randomUUID(),
      now = Date.now();
    const receipt = {
      id,
      sourceId: source.id,
      targetId: target.id,
      ruleId: rule.id,
      ruleName: rule.name,
      rule: structuredClone(rule),
      createdAt: now,
      ...preview,
    };
    const statements =
      plan.added || plan.updated
        ? await versionedWorkspaceStatements(db, updatedTarget, 'Grid edit')
        : [];
    await db.batch([
      ...statements,
      ...signalStatements(db, target, updatedTarget, {
        id,
        origin: 'Table transfer',
        columnIds: [rule.targetKey, ...Object.keys(rule.mapping)],
      }),
      db
        .prepare(
          'INSERT INTO table_transfer_runs (id,source_id,target_id,receipt,created_at) VALUES (?,?,?,?,?)',
        )
        .bind(id, source.id, target.id, JSON.stringify(receipt), now),
    ]);
    return Response.json({ receipt });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Transfer failed.' },
      { status: 400 },
    );
  }
}
export async function GET(request: Request) {
  const sourceId = new URL(request.url).searchParams.get('sourceId') ?? '';
  const db = await ensureDatabase();
  const rows = await db
    .prepare(
      'SELECT receipt FROM table_transfer_runs WHERE source_id = ? ORDER BY created_at DESC LIMIT 10',
    )
    .bind(sourceId)
    .all<{ receipt: string }>();
  return Response.json({
    runs: rows.results.map((r) => JSON.parse(r.receipt)),
  });
}
