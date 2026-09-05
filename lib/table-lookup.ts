import type {
  PomadeColumn,
  PomadeRow,
  TableLookup,
  WorkspaceSnapshot,
} from './pomade-types';

export function isNumericLookup(mode: TableLookup['resultMode']) {
  return (
    mode === 'sum' || mode === 'average' || mode === 'min' || mode === 'max'
  );
}
export function aggregateLookupValues(
  values: string[],
  mode: NonNullable<TableLookup['resultMode']>,
) {
  const numbers = values
    .filter((v) => v.trim() !== '')
    .map((v) => {
      const value = v.trim();
      if (
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ||
        !Number.isFinite(Number(value))
      )
        throw new Error('Non-numeric value in matching rows');
      return Number(value);
    });
  if (!numbers.length && mode !== 'sum')
    throw new Error('No numeric values in matching rows');
  let sum = 0,
    compensation = 0;
  for (const value of numbers) {
    const adjusted =
        (mode === 'average' ? value / numbers.length : value) - compensation,
      next = sum + adjusted;
    compensation = next - sum - adjusted;
    sum = next;
  }
  const result =
    mode === 'sum'
      ? sum
      : mode === 'average'
        ? sum
        : mode === 'min'
          ? Math.min(...numbers)
          : Math.max(...numbers);
  if (!Number.isFinite(result))
    throw new Error('Numeric result exceeds the supported range');
  return {
    value: String(Number(result.toPrecision(15))),
    count: numbers.length,
    blanks: values.length - numbers.length,
  };
}

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
    comparison?: TableLookup['comparison'];
    resultMode?: TableLookup['resultMode'];
  },
): PomadeColumn[] {
  const {
    id,
    matchColumnId,
    sourceMatchColumnId,
    sourceOutputIds: requestedOutputIds,
    normalization,
  } = options;
  const comparison = options.comparison ?? 'equals';
  const resultMode = options.resultMode ?? 'unique';
  const sourceOutputIds =
    resultMode === 'count' ? [sourceMatchColumnId] : requestedOutputIds;
  if (
    !['equals', 'contains'].includes(comparison) ||
    !['unique', 'list', 'count', 'sum', 'average', 'min', 'max'].includes(
      resultMode,
    )
  )
    throw new Error('Choose a valid comparison and result mode.');
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
      title: uniqueTitle(
        resultMode === 'count'
          ? 'Matching rows'
          : resultMode === 'list'
            ? `List: ${field.title}`
            : isNumericLookup(resultMode)
              ? `${resultMode}: ${field.title}`
              : `Lookup: ${field.title}`,
      ),
      valueType:
        resultMode === 'count' || isNumericLookup(resultMode)
          ? ('number' as const)
          : resultMode === 'list'
            ? ('text' as const)
            : (field.valueType ?? ('text' as const)),
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
    comparison,
    resultMode,
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
  const ordered: { key: string; row: PomadeRow }[] = [];
  if (!problem)
    for (const row of source!.rows) {
      const key = normalizeLookupKey(
        row.values[config.sourceMatchColumnId] ?? '',
        config.normalization,
      );
      if (key) {
        ordered.push({ key, row });
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
    const matches = key
      ? config.comparison === 'contains'
        ? ordered
            .filter((entry) => entry.key.includes(key))
            .map((entry) => entry.row)
        : (index.get(key) ?? [])
      : [];
    const mode = config.resultMode ?? 'unique';
    let status =
      problem ??
      (!key
        ? 'Missing match value'
        : mode === 'unique'
          ? !matches.length
            ? 'No match'
            : matches.length > 1
              ? `Multiple matches (${matches.length})`
              : 'Matched'
          : `${matches.length} matches`);
    let passed =
      !problem && Boolean(key) && (mode !== 'unique' || matches.length === 1);
    let values: Record<string, string> = { ...blank };
    if (passed) {
      if (mode === 'count')
        values = Object.fromEntries(
          config.outputs.map((output) => [
            output.outputColumnId,
            String(matches.length),
          ]),
        );
      else if (isNumericLookup(mode)) {
        const summaries: string[] = [];
        try {
          for (const output of config.outputs) {
            const aggregated = aggregateLookupValues(
              matches.map((row) => row.values[output.sourceColumnId] ?? ''),
              mode,
            );
            values[output.outputColumnId] = aggregated.value;
            summaries.push(
              `${output.sourceColumnId}: ${aggregated.count} numeric, ${aggregated.blanks} blank`,
            );
          }
          status += `; ${summaries.join('; ')}`;
        } catch (error) {
          passed = false;
          values = { ...blank };
          status =
            error instanceof Error
              ? error.message
              : 'Numeric aggregation failed';
        }
      } else if (mode === 'list') {
        if (matches.length > 100) {
          passed = false;
          status = 'More than 100 matches; narrow the key or use count.';
        } else {
          values = Object.fromEntries(
            config.outputs.map((output) => [
              output.outputColumnId,
              JSON.stringify(
                matches.map(
                  (match) => match.values[output.sourceColumnId] ?? '',
                ),
              ),
            ]),
          );
          if (Object.values(values).some((value) => value.length > 4000)) {
            passed = false;
            status =
              'Result list exceeds 4,000 characters; narrow the key or use count.';
            values = { ...blank };
          }
        }
      } else
        values = Object.fromEntries(
          config.outputs.map((output) => [
            output.outputColumnId,
            matches[0].values[output.sourceColumnId] ?? '',
          ]),
        );
    }
    return {
      passed,
      values: { ...values, [config.statusColumnId]: status },
      evidence: [
        ...evidence,
        `Match rule: ${config.normalization}`,
        `Comparison: ${config.comparison ?? 'equals'} (source contains local for contains)`,
        `Result mode: ${mode}`,
        status,
        ...(passed
          ? matches.slice(0, 20).map((match) => `Source row: ${match.id}`)
          : []),
        ...(passed && matches.length > 20
          ? [`${matches.length - 20} additional source rows`]
          : []),
      ],
    };
  };
}
