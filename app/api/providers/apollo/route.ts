import { mergeWorkspaceEdits } from '@/lib/workspace-merge';
import { env } from 'cloudflare:workers';

import { ensureDatabase } from '@/db/ensure';
import { versionedWorkspaceStatements } from '@/db/workspace-store';
import {
  ApolloClient,
  apolloCacheKey,
  type ApolloPersonInput,
} from '@/lib/apollo-client';
import { applyApolloBatchEnrichment } from '@/lib/apollo-enrichment';
import type {
  ApolloEnrichmentResult,
  WorkspaceSnapshot,
} from '@/lib/pomade-types';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_BATCH_SIZE = 10;
const APOLLO_CONCURRENCY = 2;

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
    let workspace = (body as { workspace: WorkspaceSnapshot })?.workspace;
    const requestedRowId = (body as { rowId?: unknown })?.rowId;
    const requestedRowIds = (body as { rowIds?: unknown })?.rowIds;
    const confirmedCreditSpend =
      (body as { confirmCreditSpend?: unknown })?.confirmCreditSpend === true;

    if (!hasRunnableWorkspace(workspace)) {
      return Response.json(
        { error: 'A workspace and selected rows are required.' },
        { status: 400 },
      );
    }
    if (
      requestedRowIds !== undefined &&
      (!Array.isArray(requestedRowIds) ||
        requestedRowIds.length === 0 ||
        requestedRowIds.length > MAX_BATCH_SIZE ||
        requestedRowIds.some((rowId) => typeof rowId !== 'string'))
    ) {
      return Response.json(
        { error: `Select between 1 and ${MAX_BATCH_SIZE} rows for Apollo.` },
        { status: 400 },
      );
    }
    const rowIds = Array.isArray(requestedRowIds)
      ? Array.from(new Set(requestedRowIds as string[]))
      : typeof requestedRowId === 'string'
        ? [requestedRowId]
        : [];
    if (!rowIds.length) {
      return Response.json(
        { error: 'Select one or more rows for Apollo.' },
        { status: 400 },
      );
    }
    if (requestedRowIds !== undefined && !confirmedCreditSpend) {
      return Response.json(
        { error: 'Confirm the maximum Apollo credit spend before running.' },
        { status: 400 },
      );
    }

    const knownRows = new Map(workspace.rows.map((row) => [row.id, row]));
    if (rowIds.some((rowId) => !knownRows.has(rowId))) {
      return Response.json(
        { error: 'One or more selected rows no longer exist.' },
        { status: 409 },
      );
    }
    const targets = rowIds.map((rowId) => ({
      rowId,
      row: knownRows.get(rowId)!,
    }));
    const eligibleTargets = targets.filter(
      ({ row }) => row.values.person?.trim() && row.values.domain?.trim(),
    );
    const skippedRowIds = targets
      .filter(
        ({ row }) => !row.values.person?.trim() || !row.values.domain?.trim(),
      )
      .map(({ rowId }) => rowId);
    if (!eligibleTargets.length) {
      return Response.json(
        {
          error:
            'Add a person name and company domain to at least one selected row.',
        },
        { status: 400 },
      );
    }

    const db = await ensureDatabase();
    const base = (body as { baseWorkspace?: WorkspaceSnapshot }).baseWorkspace;
    if (base) {
      const record = await db
        .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
        .bind(workspace.id)
        .first<{ snapshot: string }>();
      if (record)
        workspace = mergeWorkspaceEdits(
          base,
          workspace,
          JSON.parse(record.snapshot),
        );
    }

    const executionBase = structuredClone(workspace);
    const client = new ApolloClient({ apiKey: env.APOLLO_API_KEY ?? '' });
    const inFlight = new Map<string, Promise<ApolloEnrichmentResult>>();
    async function enrich(input: ApolloPersonInput) {
      const cacheKey = await apolloCacheKey(input);
      const existing = inFlight.get(cacheKey);
      if (existing) {
        return existing.then((result) => ({
          ...result,
          creditsConsumed: 0,
          cached: true,
        }));
      }
      const operation = (async () => {
        const now = Date.now();
        const cached = await db
          .prepare(
            'SELECT payload FROM provider_cache WHERE cache_key = ? AND provider = ? AND expires_at > ?',
          )
          .bind(cacheKey, 'apollo', now)
          .first<{ payload: string }>();
        if (cached) {
          return {
            ...(JSON.parse(cached.payload) as ApolloEnrichmentResult),
            creditsConsumed: 0,
            cached: true,
          };
        }
        const enrichment = await client.enrichPerson(input);
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
        return enrichment;
      })();
      inFlight.set(cacheKey, operation);
      return operation;
    }

    const settled: Array<{
      rowId: string;
      result?: ApolloEnrichmentResult;
      error?: string;
    }> = [];
    for (
      let index = 0;
      index < eligibleTargets.length;
      index += APOLLO_CONCURRENCY
    ) {
      const group = eligibleTargets.slice(index, index + APOLLO_CONCURRENCY);
      const results = await Promise.allSettled(
        group.map(({ row }) =>
          enrich({
            fullName: row.values.person.trim(),
            companyDomain: row.values.domain.trim(),
            organizationName: row.values.company?.trim() || undefined,
          }),
        ),
      );
      settled.push(
        ...results.map((result, resultIndex) =>
          result.status === 'fulfilled'
            ? { rowId: group[resultIndex].rowId, result: result.value }
            : {
                rowId: group[resultIndex].rowId,
                error:
                  result.reason instanceof Error
                    ? result.reason.message
                    : 'Apollo enrichment failed.',
              },
        ),
      );
    }
    const successful = settled.flatMap((item) =>
      item.result ? [{ rowId: item.rowId, result: item.result }] : [],
    );
    const failures = settled.flatMap((item) =>
      item.error ? [{ rowId: item.rowId, error: item.error }] : [],
    );
    if (!successful.length) throw new Error(failures[0]?.error);

    const enriched = applyApolloBatchEnrichment(
      workspace,
      successful,
      startedAt,
    );
    let updated = enriched.workspace;
    const run = enriched.run;
    const finishedAt = Date.now();
    const newest = await db
      .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
      .bind(updated.id)
      .first<{ snapshot: string }>();
    if (newest)
      updated = mergeWorkspaceEdits(
        executionBase,
        updated,
        JSON.parse(newest.snapshot),
      );
    const workspaceStatements = await versionedWorkspaceStatements(
      db,
      updated,
      'Apollo enrichment',
      finishedAt,
    );
    await db.batch([
      ...workspaceStatements,
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
          run.rowCount,
          run.actionCount,
          JSON.stringify(run),
          run.finishedAt,
        ),
    ]);

    return Response.json({
      workspace: updated,
      run,
      enrichment: successful[0]?.result,
      enrichments: successful,
      failures,
      skippedRowIds,
      summary: {
        requested: rowIds.length,
        completed: successful.length,
        failed: failures.length,
        skipped: skippedRowIds.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
