import type { PomadeColumn, WorkspaceSnapshot } from './pomade-types';
import { scheduledTransfers, pauseRecipeSchedule } from './recipe-schedule';
import { planTableTransfer } from './table-transfer';
export type WorkbookTemplate = {
  id: string;
  name: string;
  createdAt: number;
  tables: WorkspaceSnapshot[];
  externalTableIds: string[];
};
function recipeColumns(table: WorkspaceSnapshot) {
  return [
    ...table.columns,
    ...(table.recipeTemplates ?? []).map((t) => t.column),
    ...(table.recipeFunctions ?? []).flatMap((f) =>
      [...f.steps, ...(f.history ?? []).flatMap((v) => v.steps)].map(
        (s) => s.column,
      ),
    ),
  ];
}
function references(table: WorkspaceSnapshot) {
  return [
    ...recipeColumns(table).flatMap((c) =>
      c.lookup ? [c.lookup.sourceTableId] : [],
    ),
    ...(table.tableTransfers ?? []).map((r) => r.targetTableId),
    ...scheduledTransfers(table.schedule).map((r) => r.targetTableId),
  ];
}
function emptyStructure(source: WorkspaceSnapshot): WorkspaceSnapshot {
  const table = structuredClone(source);
  table.rows = [];
  table.workbookPlan = undefined;
  table.revision = 0;
  table.source = undefined;
  table.webhookMappings = undefined;
  table.webhookAutoImport = undefined;
  table.webhookImportErrors = undefined;
  if (table.schedule)
    table.schedule = {
      ...pauseRecipeSchedule(table.schedule),
      rowIds: undefined,
      nextRunAt: undefined,
      lastAttemptAt: undefined,
      lastRunAt: undefined,
      lastRunId: undefined,
      lastError: undefined,
      lastSourceBatchId: undefined,
      lastTransferRunId: undefined,
      lastTransferRunIds: undefined,
    };
  return table;
}
export function createWorkbookTemplate(
  tables: WorkspaceSnapshot[],
  name: string,
  id = crypto.randomUUID(),
): WorkbookTemplate {
  if (
    !name.trim() ||
    name.trim().length > 100 ||
    !tables.length ||
    tables.length > 10 ||
    new Set(tables.map((t) => t.id)).size !== tables.length
  )
    throw new Error('Name the template and select one to ten distinct tables.');
  const selected = new Set(tables.map((t) => t.id));
  return {
    id,
    name: name.trim(),
    createdAt: Date.now(),
    tables: tables.map(emptyStructure),
    externalTableIds: [
      ...new Set(tables.flatMap(references).filter((id) => !selected.has(id))),
    ],
  };
}
export function instantiateWorkbookTemplate(
  template: WorkbookTemplate,
  name: string,
  bindings: Record<string, string>,
  externalTables: WorkspaceSnapshot[],
) {
  if (!name.trim() || name.trim().length > 60)
    throw new Error('Choose a workbook name of 1–60 characters.');
  const ids = new Map(template.tables.map((t) => [t.id, crypto.randomUUID()]));
  for (const id of template.externalTableIds) {
    if (!bindings[id] || !externalTables.some((t) => t.id === bindings[id]))
      throw new Error('Map each external table to an available table.');
    ids.set(id, bindings[id]);
  }
  const remap = (id: string) => {
    const mapped = ids.get(id);
    if (!mapped) throw new Error('A template table reference is unavailable.');
    return mapped;
  };
  const tables = template.tables.map((source) => {
    const table = emptyStructure(source);
    table.id = remap(source.id);
    table.name = `${name.trim()} — ${source.name}`.slice(0, 100);
    table.updatedAt = Date.now();
    const visited = new Set<object>();
    for (const column of recipeColumns(table)) {
      if (column.lookup && !visited.has(column.lookup)) {
        visited.add(column.lookup);
        column.lookup.sourceTableId = remap(column.lookup.sourceTableId);
      }
    }
    for (const rule of [
      ...(table.tableTransfers ?? []),
      ...scheduledTransfers(table.schedule),
    ]) {
      if (!visited.has(rule)) {
        visited.add(rule);
        rule.targetTableId = remap(rule.targetTableId);
      }
    }
    if (table.schedule) {
      table.schedule.id = crypto.randomUUID();
      table.schedule.createdAt = Date.now();
    }
    const groups = new Map<string, string>();
    for (const c of table.columns)
      if (c.functionInstance) {
        const old = c.functionInstance.id;
        if (!groups.has(old)) groups.set(old, crypto.randomUUID());
        c.functionInstance.id = groups.get(old)!;
      }
    if (table.schedule?.functionInstanceId)
      table.schedule.functionInstanceId =
        groups.get(table.schedule.functionInstanceId) ??
        table.schedule.functionInstanceId;
    return table;
  });
  const byId = new Map([...externalTables, ...tables].map((t) => [t.id, t]));
  for (const table of tables) {
    for (const c of recipeColumns(table)) validateLookup(c, byId);
    for (const rule of [
      ...(table.tableTransfers ?? []),
      ...scheduledTransfers(table.schedule),
    ]) {
      const target = byId.get(rule.targetTableId);
      if (!target) throw new Error('Transfer destination is unavailable.');
      planTableTransfer({ ...table, rows: [] }, { ...target, rows: [] }, rule);
    }
  }
  return tables;
}
function validateLookup(
  column: PomadeColumn,
  tables: Map<string, WorkspaceSnapshot>,
) {
  if (!column.lookup) return;
  const source = tables.get(column.lookup.sourceTableId);
  const fields = [
    column.lookup.sourceMatchColumnId,
    ...column.lookup.outputs.map((o) => o.sourceColumnId),
  ];
  if (!source || fields.some((id) => !source.columns.some((c) => c.id === id)))
    throw new Error(
      `Lookup ${column.title} needs matching source column IDs in the mapped table.`,
    );
}
