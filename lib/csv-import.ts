import Papa from 'papaparse';
import { createTable } from './workbook';
import { pauseRecipeSchedule } from './recipe-schedule';
import { recalculateAutomaticFormulas } from './local-recipe-engine';
import type { PomadeColumn, WorkspaceSnapshot } from './pomade-types';
export const MAX_CSV_BYTES = 2_000_000;
export type CsvPreview = {
  columns: PomadeColumn[];
  rows: string[][];
  renamedHeaders: number;
};
export type CsvMapping = Record<string, string>;
export const CSV_NEW_COLUMN = '@new';
export const CSV_SKIP_COLUMN = '@skip';
function slug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 60) || 'column'
  );
}
function canonical(header: string) {
  const id = slug(header);
  if (['company', 'company_name', 'account', 'account_name'].includes(id))
    return 'company';
  if (['person', 'name', 'full_name', 'contact', 'contact_name'].includes(id))
    return 'person';
  if (['title', 'job_title', 'role'].includes(id)) return 'title';
  if (['domain', 'website', 'company_website', 'company_domain'].includes(id))
    return 'domain';
  if (['email', 'email_address', 'work_email'].includes(id)) return 'email';
  if (['phone', 'phone_number', 'mobile'].includes(id)) return 'phone';
  if (
    [
      'linkedin',
      'linkedin_url',
      'profile_url',
      'professional_profile_url',
    ].includes(id)
  )
    return 'profile';
  return id === 'status' ? 'csv_status' : id;
}
function unique(base: string, used: Set<string>, title = false) {
  let value = base,
    n = 2;
  while (used.has(value.toLowerCase())) {
    const suffix = title ? ` (${n++})` : `_${n++}`;
    value = (title ? base.slice(0, 80 - suffix.length) : base) + suffix;
  }
  used.add(value.toLowerCase());
  return value;
}
export function parseCsvImport(text: string): CsvPreview {
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES)
    throw new Error(
      'Choose a CSV smaller than 2 MB. Split larger exports into smaller files.',
    );
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    skipEmptyLines: 'greedy',
  });
  const error = parsed.errors.find(
    (issue) => issue.code !== 'UndetectableDelimiter',
  );
  if (error)
    throw new Error(
      `The CSV could not be read: ${error.message}. Check its quotes and separators.`,
    );
  const [headers, ...rows] = parsed.data;
  if (!headers?.length)
    throw new Error(
      'This file is empty. Include a header row with your column names.',
    );
  if (headers.length > 99)
    throw new Error(
      'Use at most 99 CSV columns; one column is reserved for run status.',
    );
  if (rows.length > 5_000)
    throw new Error(
      'This CSV has more than 5,000 rows. Split it into smaller files.',
    );
  const mismatch = rows.findIndex((row) => row.length !== headers.length);
  if (mismatch >= 0)
    throw new Error(
      `Row ${mismatch + 2} has ${rows[mismatch].length} fields; the header has ${headers.length}. Fix that row before importing.`,
    );
  const ids = new Set<string>(['status']),
    titles = new Set<string>(['run status']);
  let renamedHeaders = 0;
  const columns = headers.map((header, index): PomadeColumn => {
    const requested = header.trim() || `Column ${index + 1}`;
    if (requested.length > 80)
      throw new Error(
        `Column ${index + 1} has a name longer than 80 characters. Shorten it before importing.`,
      );
    const title = unique(requested, titles, true);
    if (title !== header.trim()) renamedHeaders++;
    return {
      id: unique(canonical(requested), ids),
      title,
      kind: 'text',
      width: Math.max(160, Math.min(280, title.length * 9 + 80)),
    };
  });
  return { columns, rows, renamedHeaders };
}
export function suggestCsvMapping(
  workspace: WorkspaceSnapshot,
  preview: CsvPreview,
): CsvMapping {
  const inputs = workspace.columns.filter((c) => c.kind === 'text');
  return Object.fromEntries(
    preview.columns.map((column) => {
      const exact = inputs.find((c) => c.id === column.id);
      const names = inputs.filter(
        (c) => c.title.trim().toLowerCase() === column.title.toLowerCase(),
      );
      return [
        column.id,
        exact?.id ?? (names.length === 1 ? names[0].id : CSV_NEW_COLUMN),
      ];
    }),
  );
}
export function planCsvAppend(
  workspace: WorkspaceSnapshot,
  preview: CsvPreview,
  mapping: CsvMapping,
) {
  if (workspace.rows.length + preview.rows.length > 5_000)
    throw new Error(
      'These rows would exceed this sheet’s 5,000-row capacity. Import into a new sheet instead.',
    );
  const usedIds = new Set(workspace.columns.map((c) => c.id.toLowerCase()));
  const usedTitles = new Set(
    workspace.columns.map((c) => c.title.toLowerCase()),
  );
  const added: PomadeColumn[] = [];
  const destinations = preview.columns.map((column) => {
    const target = mapping[column.id] ?? CSV_NEW_COLUMN;
    if (target === CSV_SKIP_COLUMN) return '';
    if (target === CSV_NEW_COLUMN) {
      const next = {
        ...column,
        id: unique(column.id, usedIds),
        title: unique(column.title, usedTitles, true),
      };
      added.push(next);
      return next.id;
    }
    if (!workspace.columns.some((c) => c.id === target && c.kind === 'text'))
      throw new Error(
        'Map CSV values to data fields; recipe and run-status columns are protected.',
      );
    return target;
  });
  const active = destinations.filter(Boolean);
  if (!active.length) throw new Error('Choose at least one column to import.');
  if (new Set(active).size !== active.length)
    throw new Error(
      'Each CSV column needs its own destination. Map duplicates to a new field or skip one.',
    );
  if (workspace.columns.length + added.length > 100)
    throw new Error(
      'This would exceed the 100-column limit. Map to existing fields, skip columns, or create a new sheet.',
    );
  return {
    columns: [
      ...workspace.columns.filter((c) => c.kind !== 'status'),
      ...added,
      ...workspace.columns.filter((c) => c.kind === 'status'),
    ],
    destinations,
    added,
  };
}
export function appendCsvRows(
  workspace: WorkspaceSnapshot,
  preview: CsvPreview,
  mapping: CsvMapping,
  filename: string,
  now = Date.now(),
): WorkspaceSnapshot {
  const plan = planCsvAppend(workspace, preview, mapping);
  const rows = preview.rows.map((record) => {
    const values = Object.fromEntries(
      plan.columns.map((c) => [c.id, c.kind === 'status' ? 'Imported' : '']),
    );
    plan.destinations.forEach((id, index) => {
      if (id) values[id] = record[index];
    });
    return recalculateAutomaticFormulas(
      { id: crypto.randomUUID(), values },
      plan.columns,
    );
  });
  return {
    ...workspace,
    columns: plan.columns,
    rows: [...workspace.rows, ...rows],
    updatedAt: now,
    source: workspace.source ?? {
      provider: 'csv',
      label: filename,
      importedAt: now,
    },
    schedule: workspace.schedule?.enabled
      ? pauseRecipeSchedule(workspace.schedule)
      : workspace.schedule,
  };
}
export function createCsvWorkspace(
  text: string,
  name: string,
  id: string,
  filename: string,
  now = Date.now(),
): WorkspaceSnapshot {
  const preview = parseCsvImport(text);
  const table = createTable({ id, name, mode: 'empty', now });
  const columns: PomadeColumn[] = [
    ...preview.columns,
    { id: 'status', title: 'Run status', kind: 'status', width: 140 },
  ];
  return {
    ...table,
    columns,
    rows: preview.rows.map((record) => ({
      id: crypto.randomUUID(),
      values: Object.fromEntries([
        ...preview.columns.map((c, index) => [c.id, record[index]]),
        ['status', 'Imported'],
      ]),
    })),
    source: { provider: 'csv', label: filename, importedAt: now },
  };
}
export function workspaceCsv(workspace: WorkspaceSnapshot): string {
  // An ordered matrix preserves duplicate display titles and hidden columns.
  return Papa.unparse({
    fields: workspace.columns.map((c) => c.title),
    data: workspace.rows.map((row) =>
      workspace.columns.map((c) => row.values[c.id] ?? ''),
    ),
  });
}
