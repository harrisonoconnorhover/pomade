import type {
  ActionReceipt,
  PomadeColumn,
  PomadeRow,
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

function structuredOutputInstruction(fields: ResearchOutputField[]) {
  const schema = fields
    .map(
      (field) =>
        `- "${field.id}" (${field.valueType}): ${compact(field.title, 100)}`,
    )
    .join('\n');
  return `Return only one valid JSON object with every key below. Do not use markdown fences or add commentary. Use null when reliable evidence is unavailable. Dates must use YYYY-MM-DD, numbers must be JSON numbers, and booleans must be true or false.\n\nOutput fields:\n${schema}`;
}

export function renderWebResearchPrompt(
  template: string,
  row: PomadeRow,
  outputFields?: ResearchOutputField[],
) {
  const rendered = template.replace(TEMPLATE_TOKEN, (_match, field: string) =>
    compact(row.values[field]),
  );
  const context = [
    ['Company', row.values.company],
    ['Domain', row.values.domain],
    ['Person', row.values.person],
    ['Title', row.values.title],
  ]
    .filter(([, value]) => compact(value))
    .map(([label, value]) => `${label}: ${compact(value)}`)
    .join('\n');

  const fields = normalizeResearchOutputFields(outputFields);
  const outputInstruction = fields.length
    ? structuredOutputInstruction(fields)
    : 'Return a direct answer in 90 words or fewer. If reliable evidence is unavailable, say "Not found" and explain what is missing.';

  return `${compact(rendered, 4_000)}\n\nResearch target:\n${context || 'Use the task text as the complete target.'}\n\nUse current public web sources. ${outputInstruction}`;
}

function extractJsonObject(answer: string) {
  const withoutFence = answer
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  return start >= 0 && end > start ? withoutFence.slice(start, end + 1) : '';
}

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
  provider: 'gemini' | 'parallel' = 'gemini',
): { workspace: WorkspaceSnapshot; receipt: ActionReceipt } {
  const rowIndex = workspace.rows.findIndex((row) => row.id === rowId);
  if (rowIndex === -1) throw new Error('The selected row no longer exists.');
  const finishedAt = Date.now();
  const row = workspace.rows[rowIndex];
  const outputFields = normalizeResearchOutputFields(column.outputFields);
  const parsed = parseStructuredResearchAnswer(result.answer, outputFields);
  const outputValues = parsed?.values ?? { [column.id]: result.answer };
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
    evidence: result.citations.map(
      (citation) => `${citation.title}: ${citation.url}`,
    ),
    outputValues,
    references: result.citations,
    queries: result.queries,
  };

  return {
    workspace: { ...workspace, rows, updatedAt: finishedAt },
    receipt,
  };
}
