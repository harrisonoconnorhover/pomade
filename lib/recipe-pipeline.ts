import type {
  ActionReceipt,
  PomadeColumn,
  RunReceipt,
  WorkspaceSnapshot,
} from './pomade-types';
import { executeWorkspace, shouldRunRecipe } from './local-recipe-engine';
import { isExternalRecipe } from './external-recipes';
export async function executeRecipePipeline(
  input: WorkspaceSnapshot,
  rowIds: string[] | undefined,
  columnIds: string[] | undefined,
  lookupTables: Record<string, WorkspaceSnapshot>,
  external: (
    workspace: WorkspaceSnapshot,
    rowId: string,
    column: PomadeColumn,
  ) => Promise<{ workspace: WorkspaceSnapshot; receipt: ActionReceipt }>,
) {
  const startedAt = Date.now();
  const targetIds = input.rows
    .filter((row) => !rowIds || rowIds.includes(row.id))
    .map((row) => row.id);
  const columns = input.columns.filter(
    (column) =>
      (column.kind === 'formula' || column.kind === 'enrichment') &&
      (!columnIds || columnIds.includes(column.id)),
  );
  let workspace = input;
  const receipts: ActionReceipt[] = [];
  let skippedCount = 0;
  for (const column of columns) {
    if (!isExternalRecipe(column)) {
      const local = executeWorkspace(
        workspace,
        targetIds,
        [column.id],
        lookupTables,
      );
      workspace = local.workspace;
      receipts.push(...local.run.receipts);
      skippedCount += local.run.skippedCount ?? 0;
      continue;
    }
    for (const id of targetIds) {
      const row = workspace.rows.find((candidate) => candidate.id === id);
      if (!row || !shouldRunRecipe(column, row)) {
        skippedCount++;
        continue;
      }
      const result = await external(workspace, id, column);
      workspace = result.workspace;
      receipts.push(result.receipt);
    }
  }
  const reviewed = new Set(
    receipts
      .filter((receipt) => receipt.status === 'review')
      .map((receipt) => receipt.rowId),
  );
  const acted = new Set(receipts.map((receipt) => receipt.rowId));
  const finishedAt = Date.now();
  workspace = {
    ...workspace,
    updatedAt: finishedAt,
    rows: workspace.rows.map((row) =>
      acted.has(row.id)
        ? {
            ...row,
            values: {
              ...row.values,
              status:
                reviewed.has(row.id) ||
                !row.values.company ||
                !row.values.domain
                  ? 'Review'
                  : 'Ready',
            },
          }
        : row,
    ),
  };
  const providers = new Set(
    receipts.map((receipt) => receipt.provider ?? 'local'),
  );
  const run: RunReceipt = {
    id: crypto.randomUUID(),
    workspaceId: input.id,
    status: 'completed',
    startedAt,
    finishedAt,
    rowCount: targetIds.length,
    actionCount: receipts.length,
    passedCount: receipts.filter((receipt) => receipt.status === 'passed')
      .length,
    reviewCount: receipts.filter((receipt) => receipt.status === 'review')
      .length,
    skippedCount,
    externalWrites: providers.has('http') ? 'unknown' : 0,
    provider: providers.size > 1 ? 'mixed' : ([...providers][0] ?? 'local'),
    receipts,
  };
  return { workspace, run };
}
