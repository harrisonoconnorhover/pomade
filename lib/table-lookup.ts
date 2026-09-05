import type {
  PomadeColumn,
  PomadeRow,
  TableLookup,
  WorkspaceSnapshot,
} from './pomade-types';

export function normalizeLookupKey(
  value: string,
  mode: TableLookup['normalization'],
): string {
  if (mode === 'exact') return value;
  const text = value.trim().toLowerCase();
  if (mode === 'text') return text;
  if (!text || /\s/.test(text)) return '';
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return '';
    return url.hostname.replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return '';
  }
}

export function createLookupColumns(
  target: WorkspaceSnapshot,
  source: WorkspaceSnapshot,
  options: {
    id: string;
    matchColumnId: string;
    sourceMatchColumnId: string;
    sourceOutputIds: string[];
    normalization: TableLookup['normalization'];
  },
): PomadeColumn[] {
  const {
    id,
    matchColumnId,
    sourceMatchColumnId,
    sourceOutputIds,
    normalization,
  } = options;
  if (source.id === target.id)
    throw new Error('Choose another table as the lookup source.');
  if (!target.columns.some((column) => column.id === matchColumnId))
    throw new Error('Choose the matching column in this table.');
  if (!source.columns.some((column) => column.id === sourceMatchColumnId))
    throw new Error('Choose the matching source column.');
  if (!['exact', 'text', 'domain'].includes(normalization))
    throw new Error('Choose a matching rule.');
  if (
    !sourceOutputIds.length ||
    sourceOutputIds.length > 4 ||
    new Set(sourceOutputIds).size !== sourceOutputIds.length
  )
    throw new Error('Choose one to four distinct fields to return.');
  const titles = new Set(
    target.columns.map((column) => column.title.toLowerCase()),
  );
  const uniqueTitle = (base: string) => {
    let title = base;
    let suffix = 2;
    while (titles.has(title.toLowerCase())) title = `${base} ${suffix++}`;
    titles.add(title.toLowerCase());
    return title;
  };
  const outputFields = sourceOutputIds.map((sourceId, index) => {
    const field = source.columns.find((column) => column.id === sourceId);
    if (!field) throw new Error('A source output column no longer exists.');
    return {
      id: index === 0 ? id : `${id}_${index}`,
      title: uniqueTitle(`Lookup: ${field.title}`),
      valueType: field.valueType ?? ('text' as const),
    };
  });
  const status = {
    id: `${id}_match`,
    title: uniqueTitle('Lookup match'),
    valueType: 'text' as const,
  };
  outputFields.push(status);
  if (target.columns.length + outputFields.length > 100)
    throw new Error('This lookup would exceed the 100-column table limit.');
  if (
    outputFields.some((output) =>
      target.columns.some((column) => column.id === output.id),
    )
  )
    throw new Error('Lookup output IDs already exist.');
  const lookup: TableLookup = {
    sourceTableId: source.id,
    sourceMatchColumnId,
    normalization,
    outputs: sourceOutputIds.map((sourceColumnId, index) => ({
      sourceColumnId,
      outputColumnId: outputFields[index].id,
    })),
    statusColumnId: status.id,
  };
  return outputFields.map((output, index) => ({
    ...output,
    width: index === outputFields.length - 1 ? 200 : 240,
    kind: index === 0 ? 'enrichment' : 'text',
    ...(index === 0
      ? {
          recipe: 'table-lookup' as const,
          inputBindings: { match: matchColumnId },
          outputFields,
          lookup,
        }
      : {}),
  }));
}

export type LookupResult = {
  values: Record<string, string>;
  passed: boolean;
  evidence: string[];
};

export function createLookupResolver(
  column: PomadeColumn,
  source?: WorkspaceSnapshot,
): (row: PomadeRow) => LookupResult {
  const config = column.lookup;
  if (
    !config?.outputs?.length ||
    !config.statusColumnId ||
    !column.inputBindings?.match
  )
    throw new Error(
      'Lookup configuration is incomplete. Recreate this lookup column.',
    );
  const blank = Object.fromEntries(
    config.outputs.map((output) => [output.outputColumnId, '']),
  );
  const problem =
    !source || source.id !== config.sourceTableId
      ? 'Source table unavailable'
      : !source.columns.some((c) => c.id === config.sourceMatchColumnId) ||
          config.outputs.some(
            (output) =>
              !source.columns.some((c) => c.id === output.sourceColumnId),
          )
        ? 'Source column unavailable'
        : undefined;
  const evidence = source
    ? [
        `Source table: ${source.name} (${source.id})`,
        `Source saved: ${new Date(source.updatedAt).toISOString()}`,
      ]
    : [`Source table ID: ${config.sourceTableId}`];
  const index = new Map<string, PomadeRow[]>();
  if (!problem)
    for (const row of source!.rows) {
      const key = normalizeLookupKey(
        row.values[config.sourceMatchColumnId] ?? '',
        config.normalization,
      );
      if (key) {
        const existing = index.get(key);
        if (existing) existing.push(row);
        else index.set(key, [row]);
      }
    }
  return (row) => {
    const key = normalizeLookupKey(
      row.values[column.inputBindings!.match] ?? '',
      config.normalization,
    );
    const matches = key ? (index.get(key) ?? []) : [];
    const status =
      problem ??
      (!key
        ? 'Missing match value'
        : !matches.length
          ? 'No match'
          : matches.length > 1
            ? `Multiple matches (${matches.length})`
            : 'Matched');
    const passed = status === 'Matched';
    return {
      passed,
      values: {
        ...(passed
          ? Object.fromEntries(
              config.outputs.map((output) => [
                output.outputColumnId,
                matches[0].values[output.sourceColumnId] ?? '',
              ]),
            )
          : blank),
        [config.statusColumnId]: status,
      },
      evidence: [
        ...evidence,
        `Match rule: ${config.normalization}`,
        status,
        ...(passed ? [`Source row: ${matches[0].id}`] : []),
      ],
    };
  };
}
