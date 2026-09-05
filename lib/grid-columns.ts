import type { WorkspaceSnapshot } from './pomade-types';

export function resizeWorkspaceColumn(
  workspace: WorkspaceSnapshot,
  columnId: string,
  width: number,
): WorkspaceSnapshot {
  if (!Number.isFinite(width)) return workspace;
  const nextWidth = Math.round(Math.min(500, Math.max(80, width)));
  const current = workspace.columns.find((column) => column.id === columnId);
  if (!current || current.width === nextWidth) return workspace;
  return {
    ...workspace,
    columns: workspace.columns.map((column) =>
      column.id === columnId ? { ...column, width: nextWidth } : column,
    ),
    updatedAt: Date.now(),
  };
}

export function moveWorkspaceColumn(
  workspace: WorkspaceSnapshot,
  startIndex: number,
  endIndex: number,
): WorkspaceSnapshot {
  if (
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex < 0 ||
    startIndex >= workspace.columns.length ||
    endIndex >= workspace.columns.length ||
    startIndex === endIndex
  ) {
    return workspace;
  }
  const statusIndex = workspace.columns.findIndex(
    (column) => column.kind === 'status',
  );
  if (startIndex === statusIndex || endIndex === statusIndex) {
    throw new Error('The run-status column stays anchored at the end.');
  }
  const priorRecipeOrder = workspace.columns
    .filter(
      (column) => column.kind === 'formula' || column.kind === 'enrichment',
    )
    .map((column) => column.id);
  const columns = [...workspace.columns];
  const [moved] = columns.splice(startIndex, 1);
  columns.splice(endIndex, 0, moved);
  const nextRecipeOrder = columns
    .filter(
      (column) => column.kind === 'formula' || column.kind === 'enrichment',
    )
    .map((column) => column.id);
  if (priorRecipeOrder.some((id, index) => nextRecipeOrder[index] !== id)) {
    throw new Error('Recipe columns must keep their execution order.');
  }
  return { ...workspace, columns, updatedAt: Date.now() };
}
