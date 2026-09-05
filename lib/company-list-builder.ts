import type {
  PomadeColumn,
  PomadeRow,
  ResearchOutputField,
  WorkspaceSnapshot,
} from './pomade-types';
import { pauseRecipeSchedule } from './recipe-schedule';

type CompanyListBuilderInput = {
  brief: string;
  limit: number;
  sourceRowId: string;
  now?: number;
};

export type CompanyListBuilderResult = {
  workspace: WorkspaceSnapshot;
  sourceRowId: string;
  researchColumnId: string;
  schedulePaused: boolean;
};

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'column'
  );
}

function uniqueId(base: string, used: Set<string>) {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

function uniqueTitle(title: string, used: Set<string>) {
  let candidate = title;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${title} ${suffix++}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function ensureColumn(
  columns: PomadeColumn[],
  usedIds: Set<string>,
  id: string,
  title: string,
  kind: PomadeColumn['kind'] = 'text',
) {
  const existing = columns.find((column) => column.id === id);
  if (existing) return existing;
  const column: PomadeColumn = {
    id: uniqueId(id, usedIds),
    title,
    kind,
    valueType: kind === 'text' ? 'text' : undefined,
    width: kind === 'status' ? 140 : 200,
  };
  columns.push(column);
  return column;
}

export function createCompanyListWorkspace(
  workspace: WorkspaceSnapshot,
  input: CompanyListBuilderInput,
): CompanyListBuilderResult {
  const brief = input.brief.trim();
  if (!brief) throw new Error('Describe the companies you want to find.');

  const now = input.now ?? Date.now();
  const limit = Math.min(25, Math.max(1, Math.round(input.limit)));
  const usedIds = new Set(workspace.columns.map((column) => column.id));
  const usedTitles = new Set(
    workspace.columns.map((column) => column.title.trim().toLowerCase()),
  );
  const dataColumns = workspace.columns
    .filter((column) => column.kind !== 'status')
    .map((column) => ({ ...column }));
  const statusColumns = workspace.columns
    .filter((column) => column.kind === 'status')
    .map((column) => ({ ...column }));

  const companyColumn = ensureColumn(
    dataColumns,
    usedIds,
    'company',
    'Company',
  );
  const domainColumn = ensureColumn(
    dataColumns,
    usedIds,
    'domain',
    'Company domain',
  );
  const briefColumn = ensureColumn(
    dataColumns,
    usedIds,
    'search_brief',
    'ICP search brief',
  );
  if (!statusColumns.length) {
    statusColumns.push(
      ensureColumn([], usedIds, 'status', 'Run status', 'status'),
    );
  }

  const outputSpecs: Array<Pick<ResearchOutputField, 'title' | 'valueType'>> = [
    { title: 'Target company', valueType: 'text' },
    { title: 'Target domain', valueType: 'text' },
    { title: 'Fit reason', valueType: 'text' },
    { title: 'Estimated employees', valueType: 'number' },
    { title: 'Headquarters', valueType: 'text' },
  ];
  const outputFields = outputSpecs.map<ResearchOutputField>((spec) => {
    const title = uniqueTitle(spec.title, usedTitles);
    return {
      ...spec,
      title,
      id: uniqueId(slugify(title), usedIds),
    };
  });
  const [primary, domainOutput, ...supporting] = outputFields;
  const researchColumn: PomadeColumn = {
    ...primary,
    kind: 'enrichment',
    recipe: 'web-research',
    width: 220,
    prompt:
      'Build an evidence-backed list of companies matching this ICP: {{search_brief}}. Prioritize exact matches in the requested market and return a canonical company domain, concise fit reason, estimated employee count, and headquarters for every result.',
    inputBindings: { search_brief: briefColumn.id },
    outputCardinality: 'list',
    listLimit: limit,
    outputFields,
    listDestinationBindings: {
      [primary.id]: companyColumn.id,
      [domainOutput.id]: domainColumn.id,
    },
    runCondition: {
      field: briefColumn.id,
      operator: 'is_not_empty',
    },
  };
  const supportingColumns: PomadeColumn[] = [domainOutput, ...supporting].map(
    (field) => ({
      ...field,
      kind: 'text',
      width: field.valueType === 'text' ? 220 : 160,
    }),
  );
  const columns = [
    ...dataColumns,
    researchColumn,
    ...supportingColumns,
    ...statusColumns,
  ];
  const blankValues = Object.fromEntries(
    columns.map((column) => [column.id, '']),
  );
  const existingRows = workspace.rows.map<PomadeRow>((row) => ({
    ...row,
    values: { ...blankValues, ...row.values },
  }));
  const sourceRow: PomadeRow = {
    id: input.sourceRowId,
    values: {
      ...blankValues,
      [companyColumn.id]: 'ICP search',
      [briefColumn.id]: brief,
      [statusColumns[0].id]: 'Draft',
    },
  };
  const schedulePaused = Boolean(workspace.schedule?.enabled);

  return {
    sourceRowId: sourceRow.id,
    researchColumnId: researchColumn.id,
    schedulePaused,
    workspace: {
      ...workspace,
      columns,
      rows: [sourceRow, ...existingRows],
      schedule:
        schedulePaused && workspace.schedule
          ? pauseRecipeSchedule(workspace.schedule, now)
          : workspace.schedule,
      updatedAt: now,
    },
  };
}
