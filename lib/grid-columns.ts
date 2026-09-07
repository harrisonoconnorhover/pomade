import type { WorkspaceSnapshot, ResearchValueType } from './pomade-types';

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

export function addWorkspaceDataColumn(
  workspace: WorkspaceSnapshot,
  input: { id: string; title: string; valueType: ResearchValueType },
  now = Date.now(),
): WorkspaceSnapshot {
  const title = input.title.replace(/\s+/g, ' ').trim();
  if (!title || title.length > 80)
    throw new Error('Use a column name between 1 and 80 characters.');
  if (
    workspace.columns.some(
      (column) => column.title.trim().toLowerCase() === title.toLowerCase(),
    )
  )
    throw new Error('Another column already uses that name.');
  if (!input.id || workspace.columns.some((column) => column.id === input.id))
    throw new Error('That column ID is already in use.');
  return {
    ...workspace,
    columns: [
      ...workspace.columns.filter((column) => column.kind !== 'status'),
      {
        id: input.id,
        title,
        kind: 'text',
        valueType: input.valueType,
        width: input.valueType === 'text' ? 220 : 160,
      },
      ...workspace.columns.filter((column) => column.kind === 'status'),
    ],
    rows: workspace.rows.map((row) => ({
      ...row,
      values: { ...row.values, [input.id]: '' },
    })),
    updatedAt: now,
  };
}

/** Visibility only changes the view; row values and recipe definitions stay intact. */
export function setWorkspaceColumnHidden(
  workspace: WorkspaceSnapshot,
  id: string,
  hidden: boolean,
): WorkspaceSnapshot {
  const column = workspace.columns.find((c) => c.id === id);
  if (!column || Boolean(column.hidden) === hidden) return workspace;
  if (hidden && workspace.columns.filter((c) => !c.hidden).length <= 1)
    return workspace;
  return {
    ...workspace,
    columns: workspace.columns.map((c) => (c.id === id ? { ...c, hidden } : c)),
    updatedAt: Date.now(),
  };
}

export function showAllWorkspaceColumns(
  workspace: WorkspaceSnapshot,
): WorkspaceSnapshot {
  if (!workspace.columns.some((c) => c.hidden)) return workspace;
  return {
    ...workspace,
    columns: workspace.columns.map((c) =>
      c.hidden ? { ...c, hidden: false } : c,
    ),
    updatedAt: Date.now(),
  };
}

export function moveVisibleWorkspaceColumn(
  workspace: WorkspaceSnapshot,
  start: number,
  end: number,
): WorkspaceSnapshot {
  const visible = workspace.columns.filter((c) => !c.hidden);
  const from = visible[start],
    to = visible[end];
  if (!from || !to) return workspace;
  return moveWorkspaceColumn(
    workspace,
    workspace.columns.indexOf(from),
    workspace.columns.indexOf(to),
  );
}
