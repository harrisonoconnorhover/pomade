import type {
  PomadeRow,
  RunConditionOperator,
  SavedView,
  WorkspaceSnapshot,
} from './pomade-types';

const valueOperators = new Set<RunConditionOperator>([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
]);

export function createSavedView(
  workspace: WorkspaceSnapshot,
  input: {
    id: string;
    name: string;
    columnId: string;
    operator: RunConditionOperator;
    value?: string;
    now?: number;
  },
): SavedView {
  const name = input.name.replace(/\s+/g, ' ').trim();
  if (!name || name.length > 60) {
    throw new Error('View names require between 1 and 60 characters.');
  }
  if (
    (workspace.savedViews ?? []).some(
      (view) => view.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new Error('A saved view already uses that name.');
  }
  if (!workspace.columns.some((column) => column.id === input.columnId)) {
    throw new Error('Choose a column that still exists.');
  }
  const value = input.value?.trim() ?? '';
  if (valueOperators.has(input.operator) && !value) {
    throw new Error('This filter needs a comparison value.');
  }
  return {
    id: input.id,
    name,
    columnId: input.columnId,
    operator: input.operator,
    value: valueOperators.has(input.operator) ? value : undefined,
    createdAt: input.now ?? Date.now(),
  };
}

export function rowMatchesSavedView(row: PomadeRow, view: SavedView) {
  const candidate = (row.values[view.columnId] ?? '').trim();
  const expected = (view.value ?? '').trim();
  switch (view.operator) {
    case 'is_empty':
      return !candidate;
    case 'is_not_empty':
      return Boolean(candidate);
    case 'equals':
      return candidate.toLowerCase() === expected.toLowerCase();
    case 'not_equals':
      return candidate.toLowerCase() !== expected.toLowerCase();
    case 'contains':
      return candidate.toLowerCase().includes(expected.toLowerCase());
    case 'not_contains':
      return !candidate.toLowerCase().includes(expected.toLowerCase());
  }
}
