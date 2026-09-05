import { env } from 'cloudflare:workers';

import { ensureDatabase } from '@/db/ensure';
import { versionedWorkspaceStatements } from '@/db/workspace-store';
import { GeminiWebResearchClient } from '@/lib/gemini-client';
import {
  countEligibleRecipeActions,
  executeWorkspace,
  shouldRunRecipe,
} from '@/lib/local-recipe-engine';
import { ParallelWebResearchClient } from '@/lib/parallel-client';
import type {
  PomadeColumn,
  RunReceipt,
  WebResearchResult,
  WorkspaceSnapshot,
} from '@/lib/pomade-types';
import {
  applyWebResearchResult,
  renderWebResearchPrompt,
  webResearchCacheKey,
} from '@/lib/web-research';

const RESEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_RESEARCH_ACTIONS = 10;

function hasRunnableWorkspace(value: unknown): value is WorkspaceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const workspace = value as Partial<WorkspaceSnapshot>;
  return (
    typeof workspace.id === 'string' &&
    Array.isArray(workspace.columns) &&
    workspace.columns.length > 0 &&
    workspace.columns.length <= 100 &&
    Array.isArray(workspace.rows) &&
    workspace.rows.length > 0 &&
    workspace.rows.length <= 5_000
  );
}

export async function GET(request: Request) {
  const workspaceId =
    new URL(request.url).searchParams.get('workspaceId') ?? 'founder-targets';
  const db = await ensureDatabase();
  const result = await db
    .prepare(
      'SELECT receipt FROM runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 10',
    )
    .bind(workspaceId)
    .all<{ receipt: string }>();

  return Response.json({
    runs: result.results.map(
      (record) => JSON.parse(record.receipt) as RunReceipt,
    ),
  });
}

export async function POST(request: Request) {
  try {
    const startedAt = Date.now();
    const body: unknown = await request.json();
    const workspace = (body as { workspace?: unknown })?.workspace;
    const requestedRowIds = (body as { rowIds?: unknown })?.rowIds;
    const requestedColumnIds = (body as { columnIds?: unknown })?.columnIds;
    const confirmedResearch =
      (body as { confirmExternalResearch?: unknown })
        ?.confirmExternalResearch === true;

    if (!hasRunnableWorkspace(workspace)) {
      return Response.json(
        { error: 'A non-empty workspace is required.' },
        { status: 400 },
      );
    }

    if (
      requestedRowIds !== undefined &&
      (!Array.isArray(requestedRowIds) ||
        requestedRowIds.length === 0 ||
        requestedRowIds.length > workspace.rows.length ||
        requestedRowIds.some((rowId) => typeof rowId !== 'string'))
    ) {
      return Response.json(
        { error: 'Select one or more valid rows to run.' },
        { status: 400 },
      );
    }

    if (
      requestedColumnIds !== undefined &&
      (!Array.isArray(requestedColumnIds) ||
        requestedColumnIds.length === 0 ||
        requestedColumnIds.length > workspace.columns.length ||
        requestedColumnIds.some((columnId) => typeof columnId !== 'string'))
    ) {
      return Response.json(
        { error: 'Select one or more valid recipe columns to run.' },
        { status: 400 },
      );
    }

    const rowIds = requestedRowIds as string[] | undefined;
    const columnIds = requestedColumnIds as string[] | undefined;
    const knownRows = new Set(workspace.rows.map((row) => row.id));
    if (rowIds?.some((rowId) => !knownRows.has(rowId))) {
      return Response.json(
        { error: 'One or more selected rows no longer exist.' },
        { status: 409 },
      );
    }
    const knownRecipeColumns = new Set(
      workspace.columns
        .filter(
          (column) => column.kind === 'formula' || column.kind === 'enrichment',
        )
        .map((column) => column.id),
    );
    if (columnIds?.some((columnId) => !knownRecipeColumns.has(columnId))) {
      return Response.json(
        { error: 'One or more selected recipe columns no longer exist.' },
        { status: 409 },
      );
    }

    const originalTargetRows = rowIds
      ? workspace.rows.filter((row) => rowIds.includes(row.id))
      : workspace.rows;
    const researchColumns = workspace.columns.filter(
      (column): column is PomadeColumn & { prompt: string } =>
        column.recipe === 'web-research' &&
        Boolean(column.prompt?.trim()) &&
        (!columnIds || columnIds.includes(column.id)),
    );
    const db = await ensureDatabase();
    const lookupTables: Record<string, WorkspaceSnapshot> = {};
    const sourceIds = new Set(
      workspace.columns
        .filter(
          (column) =>
            column.recipe === 'table-lookup' &&
            (!columnIds || columnIds.includes(column.id)),
        )
        .map((column) => column.lookup?.sourceTableId)
        .filter((id): id is string => Boolean(id)),
    );
    for (const sourceId of sourceIds) {
      const source = await db
        .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
        .bind(sourceId)
        .first<{ snapshot: string }>();
      if (source) lookupTables[sourceId] = JSON.parse(source.snapshot);
    }
    const localResult = executeWorkspace(
      workspace,
      rowIds,
      columnIds,
      lookupTables,
    );
    let updated = localResult.workspace;
    const targetRows = rowIds
      ? updated.rows.filter((row) => rowIds.includes(row.id))
      : updated.rows;
    const researchActionCount = countEligibleRecipeActions(
      targetRows,
      researchColumns,
    );
    const skippedResearchActionCount =
      originalTargetRows.length * researchColumns.length - researchActionCount;
    if (researchActionCount > MAX_RESEARCH_ACTIONS) {
      return Response.json(
        {
          error: `This run would make ${researchActionCount} web research requests. Select fewer rows so the total is ${MAX_RESEARCH_ACTIONS} or less.`,
        },
        { status: 400 },
      );
    }
    if (researchActionCount > 0 && !confirmedResearch) {
      return Response.json(
        {
          error: 'Confirm the external web research requests before running.',
        },
        { status: 400 },
      );
    }
    const parallelConfigured = Boolean(env.PARALLEL_API_KEY?.trim());
    const geminiConfigured = Boolean(env.GEMINI_API_KEY?.trim());
    if (researchActionCount > 0 && !parallelConfigured && !geminiConfigured) {
      return Response.json(
        {
          error:
            'Web research is not configured. Add PARALLEL_API_KEY or GEMINI_API_KEY to .env.local and restart Pomade.',
        },
        { status: 503 },
      );
    }

    const receipts = [...localResult.run.receipts];
    const researchProvider = parallelConfigured ? 'parallel' : 'gemini';
    const model = parallelConfigured
      ? env.PARALLEL_MODEL?.trim() || 'speed'
      : env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
    const researchClient = parallelConfigured
      ? new ParallelWebResearchClient({
          apiKey: env.PARALLEL_API_KEY ?? '',
          model,
        })
      : new GeminiWebResearchClient({
          apiKey: env.GEMINI_API_KEY ?? '',
          model,
        });

    for (const row of targetRows) {
      for (const column of researchColumns) {
        if (!shouldRunRecipe(column, row)) continue;
        const actionStartedAt = Date.now();
        const currentRow = updated.rows.find(
          (candidate) => candidate.id === row.id,
        );
        if (!currentRow) continue;
        const prompt = renderWebResearchPrompt(
          column.prompt,
          currentRow,
          column.outputFields,
          column.inputBindings,
          column.outputCardinality,
          column.listLimit,
        );
        const cacheKey = await webResearchCacheKey(model, prompt);
        const now = Date.now();
        const cached = await db
          .prepare(
            'SELECT payload FROM provider_cache WHERE cache_key = ? AND provider = ? AND expires_at > ?',
          )
          .bind(cacheKey, researchProvider, now)
          .first<{ payload: string }>();

        let result: WebResearchResult;
        if (cached) {
          result = {
            ...(JSON.parse(cached.payload) as WebResearchResult),
            cached: true,
          };
        } else {
          result = await researchClient.research(prompt);
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
              researchProvider,
              JSON.stringify(result),
              now,
              now + RESEARCH_CACHE_TTL_MS,
            )
            .run();
        }

        const applied = applyWebResearchResult(
          updated,
          row.id,
          column,
          result,
          actionStartedAt,
          researchProvider,
        );
        updated = applied.workspace;
        receipts.push(applied.receipt);
      }
    }

    const finishedAt = Date.now();
    const hasLocalActions = localResult.run.receipts.length > 0;
    const hasResearchActions = researchActionCount > 0;
    const run: RunReceipt = {
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      status: 'completed',
      startedAt,
      finishedAt,
      rowCount: targetRows.length,
      actionCount: receipts.length,
      passedCount: receipts.filter((receipt) => receipt.status === 'passed')
        .length,
      reviewCount: receipts.filter((receipt) => receipt.status === 'review')
        .length,
      skippedCount:
        (localResult.run.skippedCount ?? 0) + skippedResearchActionCount,
      externalWrites: 0,
      provider:
        hasResearchActions && hasLocalActions
          ? 'mixed'
          : hasResearchActions
            ? researchProvider
            : 'local',
      researchProvider: hasResearchActions ? researchProvider : undefined,
      receipts,
    };

    const workspaceStatements = await versionedWorkspaceStatements(
      db,
      updated,
      'Recipe run',
      finishedAt,
    );
    await db.batch([
      ...workspaceStatements,
      db
        .prepare(`INSERT INTO runs
        (id, workspace_id, status, row_count, action_count, receipt, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          run.id,
          run.workspaceId,
          run.status,
          run.rowCount,
          run.actionCount,
          JSON.stringify(run),
          finishedAt,
        ),
    ]);

    return Response.json({ workspace: updated, run });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'The recipe run failed.';
    return Response.json(
      { error: message },
      { status: message.includes('not configured') ? 503 : 502 },
    );
  }
}
