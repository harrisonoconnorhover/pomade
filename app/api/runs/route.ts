import { hasAsyncProvider } from '@/lib/enrow';
import {
  readResearchDefaults,
  readResearchModels,
} from '@/db/research-settings';
import {
  resolveCodexSettings,
  CodexSettingsError,
  codexCacheIdentity,
} from '@/lib/codex-models.mjs';
import { ResearchPendingError } from '@/lib/companion-research';
import { projectSignalFeed } from '@/lib/account-signals';
import { detectSignalChanges, type SignalBatch } from '@/lib/change-signals';
import { verifyHiringEvidence } from '@/lib/hiring-evidence';
import { configuredHttpConnections } from '@/lib/provider-connections';
import { signalBatchStatements } from '@/db/signal-store';
import { executeProviderWaterfall } from '@/lib/provider-waterfall';
import { mergeWorkspaceEdits } from '@/lib/workspace-merge';
import { env } from 'cloudflare:workers';
import {
  countMaximumExternalActions,
  isExternalRecipe,
} from '@/lib/external-recipes';
import { executeHttpRecipe } from '@/lib/http-enrichment';
import { executeRecipePipeline } from '@/lib/recipe-pipeline';

import { ensureDatabase } from '@/db/ensure';
import { versionedWorkspaceStatements } from '@/db/workspace-store';
import {
  researchConfiguration,
  createResearchClient,
  columnResearchEnvironment,
} from '@/lib/research-provider';
import { ParallelWebResearchClient } from '@/lib/parallel-client';
import type {
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
    const body: unknown = await request.json();
    let workspace = (body as { workspace: WorkspaceSnapshot })?.workspace;
    const requestedRowIds = (body as { rowIds?: unknown })?.rowIds;
    const requestedColumnIds = (body as { columnIds?: unknown })?.columnIds;
    const confirmedResearch =
      (body as { confirmExternalResearch?: unknown })
        ?.confirmExternalResearch === true;

    if (!hasRunnableWorkspace(workspace)) {
      return Response.json(
        { error: 'A valid workspace is required.' },
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

    const rowIds =
      (requestedRowIds as string[] | undefined) ??
      workspace.rows.map((row) => row.id);
    const columnIds =
      (requestedColumnIds as string[] | undefined) ??
      workspace.columns
        .filter(
          (column) => column.kind === 'formula' || column.kind === 'enrichment',
        )
        .map((column) => column.id);
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

    const storedAtStart = await db
      .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
      .bind(workspace.id)
      .first<{ snapshot: string }>();
    const executionBase = storedAtStart
      ? (JSON.parse(storedAtStart.snapshot) as WorkspaceSnapshot)
      : structuredClone(workspace);
    if ((workspace.revision ?? 0) !== (executionBase.revision ?? 0))
      throw new Error('Workspace changed; reload before retrying.');
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
    const externalColumns = workspace.columns.filter(
      (column) =>
        isExternalRecipe(column) &&
        (!columnIds || columnIds.includes(column.id)),
    );
    const maximumRequests = countMaximumExternalActions(
      originalTargetRows,
      externalColumns,
    );
    if (maximumRequests > MAX_RESEARCH_ACTIONS)
      return Response.json(
        {
          error: `This run allows up to ${maximumRequests} external requests. Select a scope of ${MAX_RESEARCH_ACTIONS} or fewer.`,
        },
        { status: 400 },
      );
    if (maximumRequests > 0 && !confirmedResearch)
      return Response.json(
        { error: 'Confirm the external requests before running.' },
        { status: 400 },
      );
    const connections = externalColumns.some(
      (column) =>
        column.recipe === 'http-api' || column.recipe === 'http-waterfall',
    )
      ? configuredHttpConnections(env)
      : [];
    const executionId =
      new URL(request.url).hostname === 'pomade.internal'
        ? (body as { executionId?: string }).executionId
        : undefined;
    if (externalColumns.some(hasAsyncProvider) && !executionId)
      return Response.json(
        {
          error:
            'Run Enrow in the background. Scheduled Enrow recipes need a workbook background run.',
        },
        { status: 409 },
      );
    const research = researchConfiguration(env);
    if (
      externalColumns.some(
        (column) =>
          column.recipe === 'web-research' &&
          researchConfiguration(columnResearchEnvironment(env, column))
            .companion,
      ) &&
      new URL(request.url).hostname !== 'pomade.internal'
    )
      return Response.json(
        {
          error:
            'Run Mac research in the background so it can wait and resume safely.',
        },
        { status: 409 },
      );
    const researchProvider = research.provider;
    const defaults = externalColumns.some(
      (c) =>
        c.recipe === 'web-research' &&
        researchConfiguration(columnResearchEnvironment(env, c)).provider ===
          'codex',
    )
      ? await readResearchDefaults(db, env)
      : {};
    let catalog: Awaited<ReturnType<typeof readResearchModels>> | undefined;

    if (workspace.signalFeedFields) {
      const feed = await db
        .prepare(
          'SELECT batch FROM signal_batches WHERE workspace_id = ? ORDER BY created_at DESC,id DESC LIMIT 100',
        )
        .bind(workspace.id)
        .all<{ batch: string }>();
      workspace = projectSignalFeed(
        workspace,
        feed.results.map((r) => JSON.parse(r.batch) as SignalBatch),
      );
    }

    const result = await executeRecipePipeline(
      workspace,
      rowIds,
      columnIds,
      lookupTables,
      async (currentWorkspace, rowId, column) => {
        if (column.recipe === 'http-waterfall')
          return executeProviderWaterfall(
            currentWorkspace,
            rowId,
            column,
            connections,
            fetch,
            executionId ? { db, id: executionId } : undefined,
          );
        if (column.recipe === 'http-api')
          return executeHttpRecipe(
            currentWorkspace,
            rowId,
            column,
            connections,
          );
        const selectedEnv = columnResearchEnvironment(env, column);
        const research = researchConfiguration(selectedEnv);
        const researchProvider = research.provider;
        const actionStartedAt = Date.now();
        const currentRow = currentWorkspace.rows.find(
          (row) => row.id === rowId,
        )!;
        try {
          if (!research.configured)
            throw new Error('Web research is not configured.');
          const prompt = renderWebResearchPrompt(
            column.prompt ?? '',
            currentRow,
            column.outputFields,
            column.inputBindings,
            column.outputCardinality,
            column.listLimit,
          );
          const settings =
            researchProvider === 'codex'
              ? (column.codexResearch ?? defaults)
              : undefined;
          if (settings && !catalog) catalog = await readResearchModels(env);
          if (settings && !catalog?.models.length)
            throw new ResearchPendingError();
          const resolved = settings
            ? resolveCodexSettings(catalog!.models, settings)
            : undefined;
          const researchClient = createResearchClient(selectedEnv, resolved);
          const model = resolved
            ? codexCacheIdentity(resolved, research.browser)
            : research.model;
          const cacheModel =
            researchProvider === 'parallel' && column.outputFields?.length
              ? `${model}:structured-v2`
              : model;
          const cacheKey = await webResearchCacheKey(cacheModel, prompt);
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
            result =
              researchClient instanceof ParallelWebResearchClient
                ? await researchClient.research(
                    prompt,
                    column.outputFields,
                    column.outputCardinality,
                    column.listLimit,
                  )
                : await researchClient.research(prompt);
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

          return verifyHiringEvidence(
            applyWebResearchResult(
              currentWorkspace,
              rowId,
              column,
              result,
              actionStartedAt,
              researchProvider,
            ),
            rowId,
            column,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Research failed.';
          if (error instanceof ResearchPendingError)
            return {
              workspace: currentWorkspace,
              receipt: {
                id: crypto.randomUUID(),
                rowId,
                rowLabel: currentRow.values.company || rowId,
                columnId: column.id,
                action: column.title,
                status: 'review' as const,
                pending: true,
                before: currentRow.values[column.id] ?? '',
                after: currentRow.values[column.id] ?? '',
                durationMs: Date.now() - actionStartedAt,
                provider: researchProvider,
                creditsConsumed: 0,
                evidence: [message],
              },
            };
          const values =
            error instanceof CodexSettingsError
              ? {}
              : Object.fromEntries(
                  (column.outputFields ?? [{ id: column.id }]).map((field) => [
                    field.id,
                    '',
                  ]),
                );
          return {
            workspace: {
              ...currentWorkspace,
              rows: currentWorkspace.rows.map((row) =>
                row.id === rowId
                  ? { ...row, values: { ...row.values, ...values } }
                  : row,
              ),
            },
            receipt: {
              id: crypto.randomUUID(),
              rowId,
              rowLabel: currentRow.values.company || rowId,
              columnId: column.id,
              action: column.title,
              status: 'review',
              before: currentRow.values[column.id] ?? '',
              after:
                error instanceof CodexSettingsError
                  ? (currentRow.values[column.id] ?? '')
                  : '',
              outputValues: values,
              durationMs: Date.now() - actionStartedAt,
              provider: research.configured ? researchProvider : 'local',
              creditsConsumed: error instanceof CodexSettingsError ? 0 : null,
              evidence: [message],
              error: message,
            },
          };
        }
      },
    );
    let updated = result.workspace;
    const run = result.run;
    if (run.receipts.some((receipt) => receipt.provider === researchProvider))
      run.researchProvider = researchProvider;
    const finishedAt = run.finishedAt;

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
    const signalColumns = workspace.columns.filter((c) =>
      run.receipts.some((r) => r.columnId === c.id),
    );
    const signalParents = new Set(originalTargetRows.map((r) => r.id));
    const signalRows = [
      ...signalParents,
      ...updated.rows
        .filter(
          (r) =>
            r.parentRowId &&
            signalParents.has(r.parentRowId) &&
            signalColumns.some((c) => c.id === r.generatedByColumnId),
        )
        .map((r) => r.id),
    ];
    const signalBatch = detectSignalChanges(executionBase, updated, {
      id: run.id,
      origin: 'Recipe run',
      rowIds: signalRows,
      columnIds: signalColumns.flatMap((c) => [
        ...(c.outputFields?.map((f) => f.id) ?? [c.id]),
        ...Object.values(c.listDestinationBindings ?? {}),
      ]),
    });
    if (signalBatch) updated = projectSignalFeed(updated, [signalBatch]);
    const workspaceStatements = await versionedWorkspaceStatements(
      db,
      updated,
      'Recipe run',
      finishedAt,
    );
    await db.batch([
      ...workspaceStatements,
      ...signalBatchStatements(db, signalBatch),
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
