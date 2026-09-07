import type { PomadeColumn, WorkspaceSnapshot } from './pomade-types';

export const DEFAULT_TABLE_ID = 'founder-targets';
export type TableSummary = {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  updatedAt: number;
  workbook?: { id: string; name: string; tableIds: string[] };
};
export type TableCreationMode = 'empty' | 'duplicate' | 'linked';

export function isTableId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

export function summarizeTable(workspace: WorkspaceSnapshot): TableSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    rowCount: workspace.rows.length,
    columnCount: workspace.columns.length,
    updatedAt: workspace.updatedAt,
    ...(workspace.workbookPlan
      ? {
          workbook: {
            id: workspace.workbookPlan.id,
            name: workspace.workbookPlan.name,
            tableIds: workspace.workbookPlan.tables.map((table) => table.id),
          },
        }
      : {}),
  };
}

/** Resolve membership against the caller's available sheets, never names alone. */
export function relatedWorkbookTables(
  tables: TableSummary[],
  activeId: string,
): TableSummary[] {
  const membership = tables.find((table) => table.id === activeId)?.workbook;
  if (!membership) return [];
  const byId = new Map(tables.map((table) => [table.id, table]));
  const related = [...new Set(membership.tableIds)].flatMap((id) => {
    const table = byId.get(id);
    return table?.workbook?.id === membership.id ? [table] : [];
  });
  return related.length >= 2 && related.some((table) => table.id === activeId)
    ? related
    : [];
}

export function createTable(options: {
  id: string;
  name: string;
  mode: TableCreationMode;
  source?: WorkspaceSnapshot;
  rowIds?: string[];
  now?: number;
}): WorkspaceSnapshot {
  const { id, mode, source, rowIds } = options;
  const name = options.name.trim();
  if (!isTableId(id) || !name || name.length > 100)
    throw new Error('Choose a table name of 1–100 characters.');
  const now = options.now ?? Date.now();
  if (mode === 'empty') {
    const columns: PomadeColumn[] = [
      { id: 'company', title: 'Company', kind: 'text', width: 180 },
      { id: 'person', title: 'Person', kind: 'text', width: 180 },
      { id: 'title', title: 'Title', kind: 'text', width: 180 },
      { id: 'domain', title: 'Company domain', kind: 'text', width: 200 },
      { id: 'email', title: 'Work email', kind: 'text', width: 230 },
      { id: 'status', title: 'Run status', kind: 'status', width: 140 },
    ];
    return { id, name, columns, rows: [], updatedAt: now };
  }
  if (!source || source.id === id)
    throw new Error('Choose an existing source table.');
  if (mode === 'duplicate') {
    return {
      ...structuredClone(source),
      id,
      name,
      schedule: undefined,
      workbookPlan: undefined,
      webhookMappings: undefined,
      tableTransfers: undefined,
      webhookAutoImport: undefined,
      revision: 0,
      updatedAt: now,
    };
  }
  if (mode !== 'linked' || !rowIds?.length)
    throw new Error('Select rows to send to the new table.');
  const selected = new Set(rowIds);
  const rows = source.rows.filter((row) => selected.has(row.id));
  if (rows.length !== selected.size)
    throw new Error(
      'Some selected rows no longer exist. Refresh the source table.',
    );
  // A new stage starts with observed values. It does not rerun the upstream research recipe.
  const columns = source.columns.map<PomadeColumn>((column) => ({
    id: column.id,
    title: column.title,
    width: column.width,
    valueType: column.valueType,
    kind: column.kind === 'status' ? 'status' : 'text',
  }));
  return {
    id,
    name,
    columns,
    updatedAt: now,
    recipeTemplates: structuredClone(source.recipeTemplates ?? []),
    rows: rows.map((row) => ({
      id: row.id,
      values: { ...row.values },
      sourceRecord: {
        tableId: source.id,
        rowId: row.id,
        tableName: source.name,
      },
    })),
  };
}
