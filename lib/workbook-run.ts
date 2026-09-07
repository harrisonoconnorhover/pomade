import type {
  PomadeColumn,
  TableTransferRule,
  WorkspaceSnapshot,
} from './pomade-types';
import { countMaximumExternalActions } from './external-recipes';

export type WorkbookRunStep = {
  tableId: string;
  tableName: string;
  title: string;
  detail: string;
  column?: PomadeColumn;
  transfer?: TableTransferRule;
  status: 'pending' | 'running' | 'completed' | 'skipped';
  rowIds?: string[];
  cursor: number;
  jobId?: string;
  completedRows: number;
  summary?: string;
};
export type WorkbookRun = {
  id: string;
  workbookId: string;
  name: string;
  status: 'running' | 'paused' | 'needs_attention' | 'completed' | 'cancelled';
  steps: WorkbookRunStep[];
  cursor: number;
  scope: Record<string, string[]>;
  reviewRows?: number;
  maxRows: number;
  maxExternalRequests: number;
  reservedRequests: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
};
export function createWorkbookRun(
  tables: WorkspaceSnapshot[],
  input: {
    id: string;
    maxRows?: number;
    maxExternalRequests?: number;
    now?: number;
  },
): WorkbookRun {
  const guide = tables[0]?.workbookPlan;
  if (!guide?.steps.length || guide.steps.length > 50)
    throw new Error('Choose a workbook created from a prompt.');
  const maxRows = input.maxRows ?? 100,
    maxExternalRequests = input.maxExternalRequests ?? 100;
  if (
    !Number.isInteger(maxRows) ||
    maxRows < 1 ||
    maxRows > 500 ||
    !Number.isInteger(maxExternalRequests) ||
    maxExternalRequests < 1 ||
    maxExternalRequests > 1000
  )
    throw new Error(
      'Choose 1–500 rows per sheet and 1–1,000 maximum provider requests.',
    );
  const steps = guide.steps.map((step): WorkbookRunStep => {
    const table = tables.find((t) => t.id === step.tableId);
    if (!table || table.workbookPlan?.id !== guide.id)
      throw new Error('A linked sheet is missing.');
    const column = step.columnId
      ? table.columns.find((c) => c.id === step.columnId && c.recipe)
      : undefined;
    const transfer = step.transferId
      ? table.tableTransfers?.find((r) => r.id === step.transferId)
      : undefined;
    if (
      (!column && !transfer) ||
      (transfer && !tables.some((t) => t.id === transfer.targetTableId))
    )
      throw new Error(
        `${step.title}: restore the missing recipe or route before running.`,
      );
    return {
      tableId: table.id,
      tableName: table.name,
      title: step.title,
      detail: step.detail,
      column: column && structuredClone(column),
      transfer: transfer && structuredClone(transfer),
      status: 'pending',
      cursor: 0,
      completedRows: 0,
    };
  });
  const root = tables.find((t) => t.id === guide.tables[0].id)!;
  const rootRows =
    root?.rows.filter((r) => !r.parentRowId).map((r) => r.id) ?? [];
  if (!rootRows.length)
    throw new Error('Add a request to the first sheet before running.');
  if (rootRows.length > maxRows)
    throw new Error(`The first sheet exceeds the ${maxRows}-row run limit.`);
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    workbookId: guide.id,
    name: guide.name,
    status: 'running',
    steps,
    cursor: 0,
    scope: { [root.id]: rootRows },
    maxRows,
    maxExternalRequests,
    reservedRequests: 0,
    createdAt: now,
    updatedAt: now,
  };
}
export function workbookStepConfigMatches(
  step: WorkbookRunStep,
  workspace: WorkspaceSnapshot,
) {
  return (
    JSON.stringify(step.column ?? step.transfer) ===
    JSON.stringify(
      step.column
        ? workspace.columns.find((c) => c.id === step.column!.id)
        : workspace.tableTransfers?.find((r) => r.id === step.transfer!.id),
    )
  );
}
export function workbookBatch(
  run: WorkbookRun,
  step: WorkbookRunStep,
  workspace: WorkspaceSnapshot,
) {
  const ids = step.rowIds ?? run.scope[workspace.id] ?? [];
  if (ids.length > run.maxRows)
    throw new Error(
      `${workspace.name} has ${ids.length} routed rows; the run limit is ${run.maxRows}.`,
    );
  const byId = new Map(workspace.rows.map((r) => [r.id, r]));
  const rowIds: string[] = [];
  let requests = 0;
  for (const id of ids.slice(step.cursor, step.cursor + 100)) {
    const row = byId.get(id);
    if (!row)
      throw new Error(
        'A scoped row was removed. Cancel this run and start again.',
      );
    const cost = step.column
      ? countMaximumExternalActions([row], [step.column])
      : 0;
    if (cost > 10)
      throw new Error('One row would exceed the 10-request limit.');
    if (requests + cost > 50) break;
    rowIds.push(id);
    requests += cost;
  }
  if (run.reservedRequests + requests > run.maxExternalRequests)
    throw new Error(
      `Provider request limit reached (${run.maxExternalRequests}). Completed work is saved. Raise the limit to continue.`,
    );
  return { rowIds, requests };
}
export function workbookRunPercent(run: WorkbookRun) {
  const step = run.steps[run.cursor];
  const partial = step?.rowIds?.length ? step.cursor / step.rowIds.length : 0;
  return Math.min(
    100,
    Math.floor((100 * (run.cursor + partial)) / Math.max(1, run.steps.length)),
  );
}
