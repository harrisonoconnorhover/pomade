import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/ensure';
import { webhookSources, webhookRecords } from '@/lib/webhook-inbox';
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function POST(request: Request) {
  let sources;
  try {
    sources = webhookSources(env.POMADE_WEBHOOK_SOURCES);
  } catch {
    return Response.json(
      { error: 'Webhook configuration is invalid.' },
      { status: 503 },
    );
  }
  const source = sources.find(
    (s) => s.id === new URL(request.url).searchParams.get('source'),
  );
  const authorization = request.headers.get('authorization') ?? '';
  if (
    !source ||
    (await hash(authorization)) !== (await hash(`Bearer ${source.token}`))
  )
    return Response.json(
      { error: 'Invalid webhook credentials.' },
      { status: 401 },
    );
  const key = request.headers.get('idempotency-key');
  if (!key || key.length > 200)
    return Response.json(
      {
        error:
          'Supply an Idempotency-Key header of 1–200 characters and reuse it for delivery retries.',
      },
      { status: 400 },
    );
  let validated = false;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('A JSON body is required.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        return Response.json(
          { error: 'Payload exceeds 256 KiB.' },
          { status: 413 },
        );
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const records = webhookRecords(JSON.parse(new TextDecoder().decode(bytes)));
    validated = true;
    const payload = JSON.stringify(records);
    const id = await hash(`${source.id}\n${source.tableId}\n${key}`);
    const payloadHash = await hash(payload);
    const db = await ensureDatabase();
    if (
      !(await db
        .prepare('SELECT id FROM workspaces WHERE id = ?')
        .bind(source.tableId)
        .first())
    )
      return Response.json(
        { error: 'Target table does not exist.' },
        { status: 404 },
      );
    const insert = await db
      .prepare(
        'INSERT OR IGNORE INTO webhook_events (id, source_id, workspace_id, payload_hash, records, received_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(id, source.id, source.tableId, payloadHash, payload, Date.now())
      .run();
    const stored = await db
      .prepare('SELECT payload_hash FROM webhook_events WHERE id = ?')
      .bind(id)
      .first<{ payload_hash: string }>();
    if (stored?.payload_hash !== payloadHash)
      return Response.json(
        {
          error:
            'This Idempotency-Key was already used with a different payload.',
        },
        { status: 409 },
      );
    return Response.json(
      {
        id,
        duplicate: insert.meta.changes === 0,
        recordCount: records.length,
        state: 'inbox',
      },
      { status: insert.meta.changes === 0 ? 200 : 202 },
    );
  } catch {
    return Response.json(
      {
        error: validated
          ? 'Webhook storage is temporarily unavailable. Retry with the same Idempotency-Key.'
          : 'Send valid JSON: one object or an array of 1–100 objects.',
      },
      { status: validated ? 503 : 400 },
    );
  }
}
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const tableId = query.get('workspaceId') ?? '';
  const offset = Number(query.get('offset') ?? 0);
  const source = query.get('source') || null;
  if (!Number.isSafeInteger(offset) || offset < 0)
    return Response.json({ error: 'Invalid inbox offset.' }, { status: 400 });
  let sources;
  try {
    sources = webhookSources(env.POMADE_WEBHOOK_SOURCES);
  } catch {
    return Response.json(
      { error: 'Webhook configuration is invalid.' },
      { status: 503 },
    );
  }
  const db = await ensureDatabase();
  const result = await db
    .prepare(
      'SELECT id, source_id, records, received_at FROM webhook_events WHERE workspace_id = ? AND (? IS NULL OR source_id = ?) ORDER BY received_at DESC, id DESC LIMIT 51 OFFSET ?',
    )
    .bind(tableId, source, source, offset)
    .all<{
      id: string;
      source_id: string;
      records: string;
      received_at: number;
    }>();
  return Response.json({
    sources: sources
      .filter((s) => s.tableId === tableId)
      .map((s) => ({ id: s.id, path: `/api/webhooks?source=${s.id}` })),
    events: result.results.slice(0, 50).map((e) => ({
      id: e.id,
      sourceId: e.source_id,
      receivedAt: e.received_at,
      records: JSON.parse(e.records),
    })),
    hasMore: result.results.length > 50,
  });
}
