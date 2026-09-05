import { mergeWorkspaceEdits } from '@/lib/workspace-merge';
import { ensureDatabase } from '@/db/ensure';
import { versionedWorkspaceStatements } from '@/db/workspace-store';
import {
  countMaximumExternalActions,
  isExternalRecipe,
} from '@/lib/external-recipes';
import type {
  RunJob,
  RunJobStatus,
  WorkspaceSnapshot,
} from '@/lib/pomade-types';
import { MAX_BACKGROUND_RESEARCH_ACTIONS, createRunJob } from '@/lib/run-job';

type RunJobRecord = {
  id: string;
  workspace_id: string;
  status: string;
  row_ids: string;
  column_ids: string | null;
  cursor: number;
  completed_count: number;
  skipped_count: number;
  confirm_external_research: number;
  lease_until: number | null;
  last_run_id: string | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

const MAX_RESEARCH_ACTIONS_PER_ROW = 10;

function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
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

function parseJsonArray(value: string | null) {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : undefined;
  } catch {
    return undefined;
  }
}

function toRunJob(record: RunJobRecord): RunJob {
  return {
    id: record.id,
    workspaceId: record.workspace_id,
    status: record.status as RunJobStatus,
    rowIds: parseJsonArray(record.row_ids) ?? [],
    columnIds: parseJsonArray(record.column_ids),
    cursor: record.cursor,
    completedCount: record.completed_count,
    skippedCount: record.skipped_count,
    confirmExternalResearch: record.confirm_external_research === 1,
    leaseUntil: record.lease_until ?? undefined,
    lastRunId: record.last_run_id ?? undefined,
    lastError: record.last_error ?? undefined,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

async function readJob(jobId: string) {
  const db = await ensureDatabase();
  const record = await db
    .prepare('SELECT * FROM run_jobs WHERE id = ?')
    .bind(jobId)
    .first<RunJobRecord>();
  return record ? toRunJob(record) : null;
}

export async function GET(request: Request) {
  const workspaceId =
    new URL(request.url).searchParams.get('workspaceId') ?? 'founder-targets';
  const db = await ensureDatabase();
  const result = await db
    .prepare(
      `SELECT * FROM run_jobs
       WHERE workspace_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
    )
    .bind(workspaceId)
    .all<RunJobRecord>();
  return Response.json({ jobs: result.results.map(toRunJob) });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    let workspace = (body as { workspace: WorkspaceSnapshot })?.workspace;
    const requestedRowIds = (body as { rowIds?: unknown })?.rowIds;
    const requestedColumnIds = (body as { columnIds?: unknown })?.columnIds;
    const confirmExternalResearch =
      (body as { confirmExternalResearch?: unknown })
        ?.confirmExternalResearch === true;

    if (
      !isWorkspaceSnapshot(workspace) ||
      !Array.isArray(requestedRowIds) ||
      requestedRowIds.some((rowId) => typeof rowId !== 'string') ||
      (requestedColumnIds !== undefined &&
        (!Array.isArray(requestedColumnIds) ||
          requestedColumnIds.some((columnId) => typeof columnId !== 'string')))
    ) {
      return Response.json(
        { error: 'A valid workspace and row scope are required.' },
        { status: 400 },
      );
    }

    const rowIds = Array.from(new Set(requestedRowIds as string[]));
    const columnIds = requestedColumnIds
      ? Array.from(new Set(requestedColumnIds as string[]))
      : undefined;
    const knownRows = new Set(workspace.rows.map((row) => row.id));
    if (rowIds.some((rowId) => !knownRows.has(rowId))) {
      return Response.json(
        { error: 'One or more queued rows no longer exist.' },
        { status: 409 },
      );
    }
    const recipeColumns = workspace.columns.filter(
      (column) => column.kind === 'formula' || column.kind === 'enrichment',
    );
    const knownRecipeColumns = new Set(
      recipeColumns.map((column) => column.id),
    );
    if (
      columnIds?.length === 0 ||
      columnIds?.some((columnId) => !knownRecipeColumns.has(columnId))
    ) {
      return Response.json(
        { error: 'One or more queued recipe columns no longer exist.' },
        { status: 409 },
      );
    }
    const selectedRecipes = columnIds
      ? recipeColumns.filter((column) => columnIds.includes(column.id))
      : recipeColumns;
    if (!selectedRecipes.length) {
      return Response.json(
        { error: 'Add at least one recipe before creating a background run.' },
        { status: 400 },
      );
    }
    const targetRows = workspace.rows.filter((row) => rowIds.includes(row.id));
    const researchColumns = selectedRecipes.filter(isExternalRecipe);
    const researchActionCount = countMaximumExternalActions(
      targetRows,
      researchColumns,
    );
    const oversizedRow = targetRows.some(
      (row) =>
        countMaximumExternalActions([row], researchColumns) >
        MAX_RESEARCH_ACTIONS_PER_ROW,
    );
    if (oversizedRow) {
      return Response.json(
        {
          error: `A queued row can run at most ${MAX_RESEARCH_ACTIONS_PER_ROW} external recipes.`,
        },
        { status: 400 },
      );
    }
    if (researchActionCount > MAX_BACKGROUND_RESEARCH_ACTIONS) {
      return Response.json(
        {
          error: `This job would make ${researchActionCount} external requests. Reduce the scope to ${MAX_BACKGROUND_RESEARCH_ACTIONS} or fewer.`,
        },
        { status: 400 },
      );
    }
    if (researchActionCount > 0 && !confirmExternalResearch) {
      return Response.json(
        { error: 'Confirm the background provider requests before queuing.' },
        { status: 400 },
      );
    }

    const job = createRunJob({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      rowIds,
      columnIds,
      confirmExternalResearch,
    });
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

    const active = await db
      .prepare(
        `SELECT id FROM run_jobs
         WHERE workspace_id = ? AND status IN ('queued', 'running', 'paused')
         LIMIT 1`,
      )
      .bind(workspace.id)
      .first<{ id: string }>();
    if (active) {
      return Response.json(
        {
          error:
            'This workspace already has an active background run. Finish, resume, or pause it before starting another.',
        },
        { status: 409 },
      );
    }
    const now = Date.now();
    const storedWorkspace = { ...workspace, updatedAt: now };
    const workspaceStatements = await versionedWorkspaceStatements(
      db,
      storedWorkspace,
      'Background run queued',
      now,
    );
    await db.batch([
      ...workspaceStatements,
      db
        .prepare(
          `INSERT INTO run_jobs
            (id, workspace_id, status, row_ids, column_ids, cursor,
             completed_count, skipped_count, confirm_external_research,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
        )
        .bind(
          job.id,
          job.workspaceId,
          job.status,
          JSON.stringify(job.rowIds),
          job.columnIds ? JSON.stringify(job.columnIds) : null,
          job.confirmExternalResearch ? 1 : 0,
          job.createdAt,
          job.updatedAt,
        ),
    ]);

    return Response.json({ job }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'The background run could not be created.',
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const body: unknown = await request.json();
  const jobId = (body as { jobId?: unknown })?.jobId;
  const action = (body as { action?: unknown })?.action;
  if (
    typeof jobId !== 'string' ||
    (action !== 'pause' && action !== 'resume')
  ) {
    return Response.json(
      { error: 'Choose a valid background run action.' },
      { status: 400 },
    );
  }
  const current = await readJob(jobId);
  if (!current) {
    return Response.json(
      { error: 'The background run no longer exists.' },
      { status: 404 },
    );
  }
  const db = await ensureDatabase();
  const now = Date.now();
  if (action === 'pause') {
    const result = await db
      .prepare(
        `UPDATE run_jobs
         SET status = 'paused', updated_at = ?
         WHERE id = ? AND status IN ('queued', 'running')`,
      )
      .bind(now, jobId)
      .run();
    if (result.meta.changes !== 1) {
      return Response.json(
        { error: 'Only a queued or running job can be paused.' },
        { status: 409 },
      );
    }
  } else {
    const active = await db
      .prepare(
        `SELECT id FROM run_jobs
         WHERE workspace_id = ? AND id != ?
           AND status IN ('queued', 'running', 'paused')
         LIMIT 1`,
      )
      .bind(current.workspaceId, jobId)
      .first<{ id: string }>();
    if (active) {
      return Response.json(
        { error: 'Another background run is already active.' },
        { status: 409 },
      );
    }
    const result = await db
      .prepare(
        `UPDATE run_jobs
         SET status = CASE
               WHEN lease_until IS NOT NULL AND lease_until > ? THEN 'running'
               ELSE 'queued'
             END,
             lease_until = CASE
               WHEN lease_until IS NOT NULL AND lease_until > ? THEN lease_until
               ELSE NULL
             END,
             last_error = NULL,
             updated_at = ?
         WHERE id = ? AND status IN ('paused', 'failed')`,
      )
      .bind(now, now, now, jobId)
      .run();
    if (result.meta.changes !== 1) {
      return Response.json(
        { error: 'Only a paused or failed job can be resumed.' },
        { status: 409 },
      );
    }
  }
  return Response.json({ job: await readJob(jobId) });
}
