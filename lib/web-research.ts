import type {
  ActionReceipt,
  PomadeColumn,
  PomadeRow,
  ResearchOutputCardinality,
  ResearchOutputField,
  WebResearchResult,
  WorkspaceSnapshot,
} from './pomade-types';

const TEMPLATE_TOKEN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

function compact(value: string | undefined, limit = 500) {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function normalizeResearchOutputFields(
  fields: ResearchOutputField[] | undefined,
) {
  const seen = new Set<string>();
  return (fields ?? [])
    .filter((field) => {
      const valid =
        /^[a-zA-Z0-9_]{1,80}$/.test(field.id) &&
        field.title.trim().length > 0 &&
        !seen.has(field.id);
      if (valid) seen.add(field.id);
      return valid;
    })
    .slice(0, 6);
}

function structuredOutputInstruction(
  fields: ResearchOutputField[],
  cardinality: ResearchOutputCardinality = 'record',
  listLimit = 10,
) {
  const schema = fields
    .map(
      (field) =>
        `- "${field.id}" (${field.valueType}): ${compact(field.title, 100)}`,
    )
    .join('\n');
  const valueRules =
    'Do not use markdown fences or add commentary. Use null when reliable evidence is unavailable. Dates must use YYYY-MM-DD, numbers must be JSON numbers, and booleans must be true or false.';
  if (cardinality === 'list') {
    return `Return only one valid JSON array containing at most ${Math.min(25, Math.max(1, listLimit))} objects. Every object must include every key below. ${valueRules}\n\nFields for each result:\n${schema}`;
  }
  return `Return only one valid JSON object with every key below. ${valueRules}\n\nOutput fields:\n${schema}`;
}

export function renderWebResearchPrompt(
  template: string,
  row: PomadeRow,
  outputFields?: ResearchOutputField[],
  inputBindings?: Record<string, string>,
  outputCardinality: ResearchOutputCardinality = 'record',
  listLimit = 10,
) {
  const fieldValue = (field: string) => {
    const sourceField =
      inputBindings && Object.hasOwn(inputBindings, field)
        ? inputBindings[field]
        : field;
    return sourceField ? row.values[sourceField] : undefined;
  };
  const rendered = template.replace(TEMPLATE_TOKEN, (_match, field: string) =>
    compact(fieldValue(field)),
  );
  const context = [
    ['Company', fieldValue('company')],
    ['Domain', fieldValue('domain')],
    ['Person', fieldValue('person')],
    ['Title', fieldValue('title')],
  ]
    .filter(([, value]) => compact(value))
    .map(([label, value]) => `${label}: ${compact(value)}`)
    .join('\n');

  const fields = normalizeResearchOutputFields(outputFields);
  const outputInstruction = fields.length
    ? structuredOutputInstruction(fields, outputCardinality, listLimit)
    : 'Return a direct answer in 90 words or fewer. If reliable evidence is unavailable, say "Not found" and explain what is missing.';

  return `${compact(rendered, 4_000)}\n\nResearch target:\n${context || 'Use the task text as the complete target.'}\n\nResearch date: ${new Date().toISOString().slice(0, 10)}. Use current public web sources. ${outputInstruction}`;
}

// Providers can append a Sources section even when JSON-only output is requested.
// Stop at the matching delimiter; citation brackets are outside the JSON value.
export function extractJsonContainer(answer: string, opening: '{' | '[') {
  const closing = opening === '{' ? '}' : ']';
  const start = answer.indexOf(opening);
  if (start < 0) return '';
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = start; i < answer.length; i++) {
    const ch = answer[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === opening) depth++;
    else if (ch === closing && --depth === 0) return answer.slice(start, i + 1);
  }
  return '';
}
const extractJsonObject = (answer: string) => extractJsonContainer(answer, '{');
const extractJsonArray = (answer: string) => extractJsonContainer(answer, '[');

function validStructuredValue(value: unknown, field: ResearchOutputField) {
  if (value === null || value === undefined) return true;
  switch (field.valueType) {
    case 'number':
      return (
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' &&
          value.trim().length > 0 &&
          Number.isFinite(Number(value)))
      );
    case 'boolean':
      return (
        typeof value === 'boolean' ||
        (typeof value === 'string' &&
          ['true', 'false', 'yes', 'no', '1', '0'].includes(
            value.toLowerCase(),
          ))
      );
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);
    case 'text':
      return (
        ['string', 'number', 'boolean'].includes(typeof value) ||
        (Array.isArray(value) &&
          value.every((item) =>
            ['string', 'number', 'boolean'].includes(typeof item),
          ))
      );
  }
}

function formatStructuredValue(value: unknown, field: ResearchOutputField) {
  if (value === null || value === undefined) return '';
  switch (field.valueType) {
    case 'number': {
      const candidate =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? Number(value)
            : Number.NaN;
      return Number.isFinite(candidate) ? String(candidate) : '';
    }
    case 'boolean': {
      const candidate = typeof value === 'string' ? value.toLowerCase() : '';
      if (value === true || ['true', 'yes', '1'].includes(candidate))
        return 'Yes';
      if (value === false || ['false', 'no', '0'].includes(candidate))
        return 'No';
      return '';
    }
    case 'date': {
      const candidate = typeof value === 'string' ? value.trim() : '';
      return /^\d{4}-\d{2}-\d{2}/.test(candidate) ? candidate.slice(0, 10) : '';
    }
    case 'text':
      return compact(
        Array.isArray(value)
          ? value
              .filter(
                (item) =>
                  typeof item === 'string' ||
                  typeof item === 'number' ||
                  typeof item === 'boolean',
              )
              .map((item) =>
                typeof item === 'string' ? item : JSON.stringify(item),
              )
              .join('; ')
          : typeof value === 'string'
            ? value
            : typeof value === 'number' || typeof value === 'boolean'
              ? JSON.stringify(value)
              : '',
        1_500,
      );
  }
}

export function parseStructuredResearchAnswer(
  answer: string,
  outputFields: ResearchOutputField[] | undefined,
) {
  const fields = normalizeResearchOutputFields(outputFields);
  if (!fields.length) return null;
  try {
    const parsed = JSON.parse(extractJsonObject(answer)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Structured research output is not an object.');
    }
    const payload = parsed as Record<string, unknown>;
    const complete = fields.every(
      (field) =>
        Object.prototype.hasOwnProperty.call(payload, field.id) &&
        validStructuredValue(payload[field.id], field),
    );
    return {
      valid: complete,
      values: Object.fromEntries(
        fields.map((field) => [
          field.id,
          formatStructuredValue(payload[field.id], field),
        ]),
      ),
    };
  } catch {
    return {
      valid: false,
      values: Object.fromEntries(
        fields.map((field, index) => [
          field.id,
          index === 0 ? compact(answer, 4_000) : '',
        ]),
      ),
    };
  }
}

export function parseListResearchAnswer(
  answer: string,
  outputFields: ResearchOutputField[] | undefined,
  listLimit = 10,
) {
  const fields = normalizeResearchOutputFields(outputFields);
  if (!fields.length) return null;
  try {
    const parsed = JSON.parse(extractJsonArray(answer)) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('List research output is not an array.');
    }
    const limited = parsed.slice(0, Math.min(25, Math.max(1, listLimit)));
    const valid = limited.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        fields.every(
          (field) =>
            Object.prototype.hasOwnProperty.call(item, field.id) &&
            validStructuredValue(
              (item as Record<string, unknown>)[field.id],
              field,
            ),
        ),
    );
    return {
      valid,
      items: valid
        ? limited.map((item) =>
            Object.fromEntries(
              fields.map((field) => [
                field.id,
                formatStructuredValue(
                  (item as Record<string, unknown>)[field.id],
                  field,
                ),
              ]),
            ),
          )
        : [],
    };
  } catch {
    return { valid: false, items: [] };
  }
}

function summarizeOutputs(
  fields: ResearchOutputField[],
  values: Record<string, string>,
) {
  return fields
    .map((field) => `${field.title}: ${values[field.id] || 'Not found'}`)
    .join(' · ')
    .slice(0, 4_000);
}

export async function webResearchCacheKey(model: string, prompt: string) {
  const bytes = new TextEncoder().encode(
    `${model.trim().toLowerCase()}\u0000${prompt.trim()}`,
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function applyWebResearchResult(
  workspace: WorkspaceSnapshot,
  rowId: string,
  column: PomadeColumn,
  result: WebResearchResult,
  startedAt: number,
  provider: 'gemini' | 'parallel' | 'codex' = 'gemini',
): { workspace: WorkspaceSnapshot; receipt: ActionReceipt } {
  const rowIndex = workspace.rows.findIndex((row) => row.id === rowId);
  if (rowIndex === -1) throw new Error('The selected row no longer exists.');
  const finishedAt = Date.now();
  const row = workspace.rows[rowIndex];
  const outputFields = normalizeResearchOutputFields(column.outputFields);
  if (column.outputCardinality === 'list') {
    const parsed = parseListResearchAnswer(
      result.answer,
      outputFields,
      column.listLimit,
    );
    const items = parsed?.items ?? [];
    const existingChildren = workspace.rows.filter(
      (candidate) =>
        candidate.parentRowId === rowId &&
        candidate.generatedByColumnId === column.id,
    );
    const replaceChildren = Boolean(parsed?.valid);
    const projectedRowCount =
      workspace.rows.length -
      (replaceChildren ? existingChildren.length : 0) +
      items.length;
    if (projectedRowCount > 5_000) {
      throw new Error(
        'List research would exceed the 5,000-row workspace limit.',
      );
    }
    const grounded = result.citations.length > 0 && Boolean(parsed?.valid);
    const parentValues = {
      ...row.values,
      ...Object.fromEntries(outputFields.map((field) => [field.id, ''])),
      [`__research_${column.id}_raw`]: result.answer,
      [`__research_${column.id}_sources`]: JSON.stringify(result.citations),
      [`__research_${column.id}_queries`]: JSON.stringify(result.queries),
      [`__research_${column.id}_browser`]: JSON.stringify(
        result.browserVisits ?? [],
      ),
      status: grounded ? 'Ready' : 'Review',
    };
    const createdRows = items.map<PomadeRow>((values, index) => ({
      id: `${rowId}__${column.id}__${index + 1}`,
      parentRowId: rowId,
      generatedByColumnId: column.id,
      generatedAt: finishedAt,
      values: {
        ...parentValues,
        ...values,
        ...Object.fromEntries(
          Object.entries(column.listDestinationBindings ?? {}).flatMap(
            ([sourceId, destinationId]) =>
              Object.hasOwn(values, sourceId)
                ? [[destinationId, values[sourceId]]]
                : [],
          ),
        ),
        [`__research_${column.id}_raw`]: result.answer,
        status: grounded ? 'Ready' : 'Review',
      },
    }));
    const rowsWithoutChildren = replaceChildren
      ? workspace.rows.filter(
          (candidate) =>
            !(
              candidate.parentRowId === rowId &&
              candidate.generatedByColumnId === column.id
            ),
        )
      : [...workspace.rows];
    const parentIndex = rowsWithoutChildren.findIndex(
      (candidate) => candidate.id === rowId,
    );
    const rows = [...rowsWithoutChildren];
    rows[parentIndex] = { ...row, values: parentValues };
    rows.splice(parentIndex + 1, 0, ...createdRows);
    const receipt: ActionReceipt = {
      id: `${rowId}-${column.id}-${startedAt}`,
      rowId,
      rowLabel:
        parentValues.company ||
        parentValues.person ||
        `Row ${Math.max(1, rowIndex + 1)}`,
      columnId: column.id,
      action: column.title,
      status: grounded ? 'passed' : 'review',
      durationMs: Math.max(1, finishedAt - startedAt),
      before: existingChildren.length
        ? `${existingChildren.length} generated rows`
        : 'No generated rows',
      after: parsed?.valid
        ? `${createdRows.length} rows created`
        : existingChildren.length
          ? 'Output needs review · existing rows preserved'
          : 'No rows created · output needs review',
      provider,
      cached: result.cached,
      researchModel: result.model,
      reasoningEffort: result.reasoningEffort,
      evidence: result.citations.map(
        (citation) => `${citation.title}: ${citation.url}`,
      ),
      createdRowCount: createdRows.length,
      createdRowIds: createdRows.map((created) => created.id),
      references: result.citations,
      queries: result.queries,
      browserVisits: result.browserVisits,
    };
    return {
      workspace: { ...workspace, rows, updatedAt: finishedAt },
      receipt,
    };
  }
  const parsed = parseStructuredResearchAnswer(result.answer, outputFields);
  // Prose and invalid types belong in the raw answer/receipt, never in fields
  // that may drive scoring, change detection or a scheduled CRM write.
  const outputValues = outputFields.length
    ? parsed?.valid
      ? parsed.values
      : Object.fromEntries(outputFields.map((field) => [field.id, '']))
    : { [column.id]: result.answer };
  const before = outputFields.length
    ? summarizeOutputs(outputFields, row.values)
    : (row.values[column.id] ?? '');
  const after = outputFields.length
    ? summarizeOutputs(outputFields, outputValues)
    : result.answer;
  const grounded = result.citations.length > 0 && (parsed?.valid ?? true);
  const values = {
    ...row.values,
    ...outputValues,
    [`__research_${column.id}_raw`]: result.answer,
    [`__research_${column.id}_sources`]: JSON.stringify(result.citations),
    [`__research_${column.id}_queries`]: JSON.stringify(result.queries),
    [`__research_${column.id}_browser`]: JSON.stringify(
      result.browserVisits ?? [],
    ),
    status: grounded ? 'Ready' : 'Review',
  };
  const rows = workspace.rows.map((candidate, index) =>
    index === rowIndex ? { ...candidate, values } : candidate,
  );
  const receipt: ActionReceipt = {
    id: `${rowId}-${column.id}-${startedAt}`,
    rowId,
    rowLabel:
      values.company || values.person || `Row ${Math.max(1, rowIndex + 1)}`,
    columnId: column.id,
    action: column.title,
    status: grounded ? 'passed' : 'review',
    durationMs: Math.max(1, finishedAt - startedAt),
    before,
    after,
    provider,
    cached: result.cached,
    researchModel: result.model,
    reasoningEffort: result.reasoningEffort,
    evidence: result.citations.map(
      (citation) => `${citation.title}: ${citation.url}`,
    ),
    outputValues,
    references: result.citations,
    queries: result.queries,
    browserVisits: result.browserVisits,
  };

  return {
    workspace: { ...workspace, rows, updatedAt: finishedAt },
    receipt,
  };
}
