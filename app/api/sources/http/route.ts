import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/ensure';
import { httpConnections } from '@/lib/http-enrichment';
import {
  fetchApiSource,
  validateApiSource,
  type ApiSourceConfig,
  type ApiSourceBatch,
} from '@/lib/api-source';
export async function POST(request: Request) {
  const body = (await request.json()) as {
    workspaceId: string;
    config: ApiSourceConfig;
    confirmRequests?: boolean;
  };
  if (body.confirmRequests !== true)
    return Response.json(
      { error: 'Confirm the maximum external requests before fetching.' },
      { status: 400 },
    );
  let connection;
  try {
    validateApiSource(body.config);
    connection = httpConnections(env.POMADE_HTTP_CONNECTIONS).find(
      (c) => c.id === body.config.connectionId,
    );
    if (!connection) throw new Error('HTTP connection is not configured.');
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid source.' },
      { status: 400 },
    );
  }
  const db = await ensureDatabase();
  if (
    !(await db
      .prepare('SELECT id FROM workspaces WHERE id = ?')
      .bind(body.workspaceId)
      .first())
  )
    return Response.json({ error: 'Table not found.' }, { status: 404 });
  const batch = await fetchApiSource(body.workspaceId, body.config, connection);
  try {
    await db
      .prepare(
        'INSERT INTO api_source_batches (id,workspace_id,batch,created_at) VALUES (?,?,?,?)',
      )
      .bind(batch.id, body.workspaceId, JSON.stringify(batch), batch.createdAt)
      .run();
  } catch {
    return Response.json({
      batch,
      error:
        'Fetch finished but saving its batch failed. Keep this preview or download it before closing.',
    });
  }
  return Response.json({ batch });
}
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const db = await ensureDatabase();
  const results = await db
    .prepare(
      'SELECT batch FROM api_source_batches WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 10',
    )
    .bind(q.get('workspaceId') ?? '')
    .all<{ batch: string }>();
  return Response.json({
    batches: results.results.map((r) => JSON.parse(r.batch) as ApiSourceBatch),
  });
}
