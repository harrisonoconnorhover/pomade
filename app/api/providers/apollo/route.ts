import { env } from 'cloudflare:workers';

import { ensureDatabase } from '@/db/ensure';
import { ApolloClient, apolloCacheKey } from '@/lib/apollo-client';
import { applyApolloEnrichment } from '@/lib/apollo-enrichment';
import type {
  ApolloEnrichmentResult,
  WorkspaceSnapshot,
} from '@/lib/pomade-types';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

function hasRunnableWorkspace(value: unknown): value is WorkspaceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const workspace = value as Partial<WorkspaceSnapshot>;
  return (
    typeof workspace.id === 'string' &&
    typeof workspace.name === 'string' &&
    Array.isArray(workspace.columns) &&
    workspace.columns.length > 0 &&
    workspace.columns.length <= 100 &&
    Array.isArray(workspace.rows) &&
    workspace.rows.length > 0 &&
    workspace.rows.length <= 5_000
  );
}

function errorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Apollo enrichment failed.';
  const status = message.includes('not configured')
    ? 503
    : message.includes('no longer exists')
      ? 409
      : 502;
  return Response.json({ error: message }, { status });
}

export async function GET() {
  return Response.json({
    provider: 'apollo',
    configured: Boolean(env.APOLLO_API_KEY?.trim()),
    capabilities: {
      personMatch: true,
      verifiedWorkEmail: true,
      phoneReveal: false,
    },
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body: unknown = await request.json();
    const workspace = (body as { workspace?: unknown })?.workspace;
    const rowId = (body as { rowId?: unknown })?.rowId;

    if (!hasRunnableWorkspace(workspace) || typeof rowId !== 'string') {
      return Response.json(
        { error: 'A workspace and selected row are required.' },
        { status: 400 },
      );
    }

    const row = workspace.rows.find((candidate) => candidate.id === rowId);
    if (!row)
      return Response.json(
        { error: 'The selected row no longer exists.' },
        { status: 409 },
      );
    const fullName = row.values.person?.trim();
    const companyDomain = row.values.domain?.trim();
    if (!fullName || !companyDomain) {
      return Response.json(
        {
          error:
            'Add a person name and company domain before enriching with Apollo.',
        },
        { status: 400 },
      );
    }

    const input = {
      fullName,
      companyDomain,
      organizationName: row.values.company?.trim() || undefined,
    };
    const cacheKey = await apolloCacheKey(input);
    const db = await ensureDatabase();
    const now = Date.now();
    const cached = await db
      .prepare(
        'SELECT payload FROM provider_cache WHERE cache_key = ? AND provider = ? AND expires_at > ?',
      )
      .bind(cacheKey, 'apollo', now)
      .first<{ payload: string }>();

    let enrichment: ApolloEnrichmentResult;
    if (cached) {
      enrichment = {
        ...(JSON.parse(cached.payload) as ApolloEnrichmentResult),
        creditsConsumed: 0,
        cached: true,
      };
    } else {
      enrichment = await new ApolloClient({
        apiKey: env.APOLLO_API_KEY ?? '',
      }).enrichPerson(input);
      await db
        .prepare(
          `INSERT INTO provider_cache (cache_key, provider, payload, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
              payload = excluded.payload,
              created_at = excluded.created_at,
              expires_at = excluded.expires_at`,
        )
        .bind(
          cacheKey,
          'apollo',
          JSON.stringify(enrichment),
          now,
          now + CACHE_TTL_MS,
        )
        .run();
    }

    const { workspace: updated, run } = applyApolloEnrichment(
      workspace,
      rowId,
      enrichment,
      startedAt,
    );
    const finishedAt = Date.now();
    await db.batch([
      db
        .prepare(
          `INSERT INTO workspaces (id, name, snapshot, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              snapshot = excluded.snapshot,
              updated_at = excluded.updated_at`,
        )
        .bind(
          updated.id,
          updated.name,
          JSON.stringify(updated),
          finishedAt,
          finishedAt,
        ),
      db
        .prepare(
          `INSERT INTO runs
            (id, workspace_id, status, row_count, action_count, receipt, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          run.id,
          run.workspaceId,
          run.status,
          1,
          1,
          JSON.stringify(run),
          run.finishedAt,
        ),
    ]);

    return Response.json({ workspace: updated, run, enrichment });
  } catch (error) {
    return errorResponse(error);
  }
}
