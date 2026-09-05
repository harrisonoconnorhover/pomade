import type {
  PomadeColumn,
  ResearchOutputField,
  WorkspaceSnapshot,
} from './pomade-types';
import { pauseRecipeSchedule } from './recipe-schedule';

type PeopleListBuilderInput = {
  rowId: string;
  brief: string;
  limit: number;
  now?: number;
};

export type PeopleListBuilderResult = {
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
) {
  const existing = columns.find((column) => column.id === id);
  if (existing) return existing;
  const column: PomadeColumn = {
    id: uniqueId(id, usedIds),
    title,
    kind: 'text',
    valueType: 'text',
    width: 190,
  };
  columns.push(column);
  return column;
}

export function createPeopleListWorkspace(
  workspace: WorkspaceSnapshot,
  input: PeopleListBuilderInput,
): PeopleListBuilderResult {
  const brief = input.brief.trim();
  if (!brief) throw new Error('Describe the people you want to find.');
  const sourceIndex = workspace.rows.findIndex((row) => row.id === input.rowId);
  if (sourceIndex === -1) throw new Error('Choose a company row first.');
  const source = workspace.rows[sourceIndex];
  if (!source.values.company?.trim() && !source.values.domain?.trim()) {
    throw new Error('The selected row needs a company or company domain.');
  }

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
  const personColumn = ensureColumn(dataColumns, usedIds, 'person', 'Person');
  const titleColumn = ensureColumn(dataColumns, usedIds, 'title', 'Title');
  const briefColumn = ensureColumn(
    dataColumns,
    usedIds,
    'people_search_brief',
    'People search brief',
  );

  const outputSpecs: Array<Pick<ResearchOutputField, 'title' | 'valueType'>> = [
    { title: 'Target person', valueType: 'text' },
    { title: 'Current title', valueType: 'text' },
    { title: 'LinkedIn URL', valueType: 'text' },
    { title: 'Role match', valueType: 'text' },
    { title: 'Location', valueType: 'text' },
  ];
  const outputFields = outputSpecs.map<ResearchOutputField>((spec) => {
    const title = uniqueTitle(spec.title, usedTitles);
    return {
      ...spec,
      title,
      id: uniqueId(slugify(title), usedIds),
    };
  });
  const [primary, titleOutput, ...supporting] = outputFields;
  const researchColumn: PomadeColumn = {
    ...primary,
    kind: 'enrichment',
    recipe: 'web-research',
    width: 210,
    prompt:
      'Find current business contacts at {{company}} ({{domain}}) matching this role brief: {{people_search_brief}}. Return only people whose current company and role are supported by public web evidence. Include a public LinkedIn profile URL when reliable, a concise role-match reason, and location. Do not infer private contact details.',
    inputBindings: {
      company: companyColumn.id,
      domain: domainColumn.id,
      people_search_brief: briefColumn.id,
    },
    outputCardinality: 'list',
    listLimit: limit,
    outputFields,
    listDestinationBindings: {
      [primary.id]: personColumn.id,
      [titleOutput.id]: titleColumn.id,
    },
    runCondition: {
      field: briefColumn.id,
      operator: 'is_not_empty',
    },
  };
  const supportingColumns: PomadeColumn[] = [titleOutput, ...supporting].map(
    (field) => ({
      ...field,
      kind: 'text',
      width: field.id.includes('linkedin') ? 240 : 190,
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
  const rows = workspace.rows.map((row, index) => ({
    ...row,
    values: {
      ...blankValues,
      ...row.values,
      ...(index === sourceIndex ? { [briefColumn.id]: brief } : {}),
    },
  }));
  const schedulePaused = Boolean(workspace.schedule?.enabled);

  return {
    sourceRowId: source.id,
    researchColumnId: researchColumn.id,
    schedulePaused,
    workspace: {
      ...workspace,
      columns,
      rows,
      schedule:
        schedulePaused && workspace.schedule
          ? pauseRecipeSchedule(workspace.schedule, now)
          : workspace.schedule,
      updatedAt: now,
    },
  };
}
