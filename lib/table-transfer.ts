import { validRunCondition } from './run-conditions';
import type {
  WorkspaceSnapshot,
  TableTransferRule,
  PomadeRow,
} from './pomade-types';
import { normalizeLookupKey } from './table-lookup';
import {
  matchesRunCondition,
  recalculateAutomaticFormulas,
} from './local-recipe-engine';
import { pauseRecipeSchedule } from './recipe-schedule';
export type TransferChange = {
  sourceRowId: string;
  targetRowId?: string;
  action: 'add' | 'update' | 'skip' | 'review';
  reason: string;
  before?: Record<string, string>;
  after?: Record<string, string>;
};
export function planTableTransfer(
  source: WorkspaceSnapshot,
  target: WorkspaceSnapshot,
  rule: TableTransferRule,
  rowIds?: string[],
) {
  if (source.id === target.id || target.id !== rule.targetTableId)
    throw new Error('Choose another destination table.');
  if (
    !rule.id ||
    !rule.name.trim() ||
    !['add', 'update', 'upsert'].includes(rule.mode) ||
    !['exact', 'text', 'domain'].includes(rule.normalization)
  )
    throw new Error('Choose a valid name and transfer mode.');
  if (
    !source.columns.some((c) => c.id === rule.sourceKey) ||
    !target.columns.some((c) => c.id === rule.targetKey && c.kind === 'text')
  )
    throw new Error('Choose existing source and destination match columns.');
  const mapping = Object.entries(rule.mapping).filter(([, id]) => id);
  if (
    !mapping.length ||
    mapping.some(
      ([dest, src]) =>
        dest === rule.targetKey ||
        !target.columns.some((c) => c.id === dest && c.kind === 'text') ||
        !source.columns.some((c) => c.id === src),
    )
  )
    throw new Error(
      'Map existing source fields to destination input columns other than the match key.',
    );
  if (
    rowIds &&
    (!rowIds.length ||
      rowIds.some((id) => !source.rows.some((r) => r.id === id)))
  )
    throw new Error('Selected source rows no longer exist.');
  const scope = rule.rowScope ?? 'source';
  if (!['source', 'children', 'source_and_children'].includes(scope))
    throw new Error('Choose a valid transfer row scope.');
  if (
    scope !== 'source' &&
    !source.columns.some(
      (c) => c.id === rule.childRecipeId && c.outputCardinality === 'list',
    )
  )
    throw new Error('Choose an existing list recipe for child-row routing.');
  if (
    rule.condition &&
    !validRunCondition(rule.condition, new Set(source.columns.map((c) => c.id)))
  )
    throw new Error('Choose an existing condition column and operator.');
  const selected = source.rows.filter((r) => !rowIds || rowIds.includes(r.id));
  const parentIds = new Set(selected.map((r) => r.id));
  const children = source.rows.filter(
    (r) =>
      r.parentRowId &&
      parentIds.has(r.parentRowId) &&
      r.generatedByColumnId === rule.childRecipeId,
  );
  const candidates =
    scope === 'source'
      ? selected
      : scope === 'children'
        ? children
        : [
            ...new Map(
              [...selected, ...children].map((r) => [r.id, r]),
            ).values(),
          ];
  const rows = candidates.filter((r) => matchesRunCondition(rule.condition, r));
  const key = (row: PomadeRow, column: string) =>
    normalizeLookupKey(row.values[column] ?? '', rule.normalization);
  function index(rows: PomadeRow[], column: string) {
    const result = new Map<string, PomadeRow[]>();
    for (const row of rows) {
      const k = key(row, column);
      if (k) result.set(k, [...(result.get(k) ?? []), row]);
    }
    return result;
  }
  const sourceIndex = index(rows, rule.sourceKey),
    targetIndex = index(target.rows, rule.targetKey);
  const nextRows = [...target.rows];
  const changes: TransferChange[] = candidates
    .filter((r) => !matchesRunCondition(rule.condition, r))
    .map((r) => ({
      sourceRowId: r.id,
      action: 'skip',
      reason: 'Routing condition did not match',
    }));
  for (const row of rows) {
    const k = key(row, rule.sourceKey),
      matches = targetIndex.get(k) ?? [];
    if (!k || (sourceIndex.get(k)?.length ?? 0) > 1 || matches.length > 1) {
      changes.push({
        sourceRowId: row.id,
        action: 'review',
        reason: !k
          ? 'Missing match key'
          : matches.length > 1
            ? 'Multiple destination matches'
            : 'Duplicate source keys',
      });
      continue;
    }
    const match = matches[0];
    if ((match && rule.mode === 'add') || (!match && rule.mode === 'update')) {
      changes.push({
        sourceRowId: row.id,
        targetRowId: match?.id,
        action: 'skip',
        reason: match ? 'Already present' : 'No destination match',
      });
      continue;
    }
    const values = {
      ...match?.values,
      ...(!match ? { [rule.targetKey]: row.values[rule.sourceKey] } : {}),
    };
    for (const [dest, src] of mapping) {
      const value = row.values[src] ?? '';
      if (!rule.skipBlank || value.trim()) values[dest] = value;
    }
    if (match && JSON.stringify(values) === JSON.stringify(match.values)) {
      changes.push({
        sourceRowId: row.id,
        targetRowId: match.id,
        action: 'skip',
        reason: 'No mapped values changed',
      });
      continue;
    }
    values.status = 'Review';
    const candidate: PomadeRow = {
      ...(match ?? { id: crypto.randomUUID() }),
      values,
      sourceRecord: {
        tableId: source.id,
        rowId: row.id,
        tableName: source.name,
      },
    };
    candidate.values = recalculateAutomaticFormulas(
      candidate,
      target.columns,
    ).values;
    if (match)
      nextRows[nextRows.findIndex((r) => r.id === match.id)] = candidate;
    else nextRows.push(candidate);
    changes.push({
      sourceRowId: row.id,
      targetRowId: candidate.id,
      action: match ? 'update' : 'add',
      reason: match ? 'Mapped fields updated' : 'New match key',
      before: match?.values,
      after: candidate.values,
    });
  }
  if (nextRows.length > 5000)
    throw new Error('Transfer would exceed the destination’s 5,000-row limit.');
  const added = changes.filter((c) => c.action === 'add').length,
    updated = changes.filter((c) => c.action === 'update').length;
  return {
    sourceRevision: source.revision ?? 0,
    targetRevision: target.revision ?? 0,
    added,
    updated,
    skipped: changes.filter((c) => c.action === 'skip').length,
    review: changes.filter((c) => c.action === 'review').length,
    changes,
    target: {
      ...target,
      rows: nextRows,
      schedule:
        (added || updated) && target.schedule?.enabled
          ? pauseRecipeSchedule(target.schedule)
          : target.schedule,
      updatedAt: Date.now(),
    },
  };
}
export function saveTransferRule(
  source: WorkspaceSnapshot,
  target: WorkspaceSnapshot,
  rule: TableTransferRule,
) {
  planTableTransfer({ ...source, rows: [] }, target, rule);
  return {
    ...source,
    tableTransfers: [
      ...(source.tableTransfers ?? []).filter((r) => r.id !== rule.id),
      structuredClone(rule),
    ],
    updatedAt: Date.now(),
  };
}
