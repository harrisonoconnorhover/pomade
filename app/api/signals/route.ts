import { ensureDatabase } from '@/db/ensure';
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('workspaceId') ?? '';
  const db = await ensureDatabase();
  const cursor = new URL(request.url).searchParams.get('before');
  const [time, lastId] = cursor?.split(':') ?? [];
  if (cursor && (!Number.isFinite(Number(time)) || !lastId))
    return Response.json({ error: 'Invalid signal cursor.' }, { status: 400 });
  const rows = await db
    .prepare(
      `SELECT batch,reviewed_at,id,created_at FROM signal_batches WHERE workspace_id = ? ${cursor ? 'AND (created_at < ? OR (created_at = ? AND id < ?))' : ''} ORDER BY created_at DESC,id DESC LIMIT 20`,
    )
    .bind(...(cursor ? [id, Number(time), Number(time), lastId] : [id]))
    .all<{
      batch: string;
      reviewed_at: number | null;
      id: string;
      created_at: number;
    }>();
  const count = await db
    .prepare(
      'SELECT COUNT(*) AS count FROM signal_batches WHERE workspace_id = ? AND reviewed_at IS NULL',
    )
    .bind(id)
    .first<{ count: number }>();
  return Response.json({
    batches: rows.results.map((r) => ({
      ...JSON.parse(r.batch),
      reviewedAt: r.reviewed_at,
    })),
    unreviewed: count?.count ?? 0,
    nextCursor:
      rows.results.length === 20
        ? `${rows.results[19].created_at}:${rows.results[19].id}`
        : undefined,
  });
}
export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    workspaceId: string;
    batchId: string;
    reviewed: boolean;
  };
  const db = await ensureDatabase();
  const result = await db
    .prepare(
      'UPDATE signal_batches SET reviewed_at = ? WHERE id = ? AND workspace_id = ?',
    )
    .bind(
      body.reviewed === true ? Date.now() : null,
      body.batchId,
      body.workspaceId,
    )
    .run();
  return result.meta.changes
    ? Response.json({ ok: true })
    : Response.json({ error: 'Signal batch not found.' }, { status: 404 });
}
