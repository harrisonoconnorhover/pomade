import { ensureDatabase } from '@/db/ensure';
import { summarizeProviderPerformance } from '@/lib/provider-performance';
import type { RunReceipt } from '@/lib/pomade-types';

export async function GET(request: Request) {
  const workspaceId =
    new URL(request.url).searchParams.get('workspaceId') ?? 'founder-targets';
  const db = await ensureDatabase();
  const rows = await db
    .prepare(
      'SELECT receipt FROM runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100',
    )
    .bind(workspaceId)
    .all<{ receipt: string }>();
  return Response.json(
    summarizeProviderPerformance(
      rows.results.map((row) => JSON.parse(row.receipt) as RunReceipt),
    ),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
