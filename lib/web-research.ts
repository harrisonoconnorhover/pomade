import type {
  ActionReceipt,
  PomadeColumn,
  PomadeRow,
  WebResearchResult,
  WorkspaceSnapshot,
} from './pomade-types';

const TEMPLATE_TOKEN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

function compact(value: string | undefined, limit = 500) {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function renderWebResearchPrompt(template: string, row: PomadeRow) {
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

  return `${compact(rendered, 4_000)}\n\nResearch target:\n${context || 'Use the task text as the complete target.'}\n\nReturn a direct answer in 90 words or fewer. Use current public web sources. If reliable evidence is unavailable, say "Not found" and explain what is missing.`;
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
): { workspace: WorkspaceSnapshot; receipt: ActionReceipt } {
  const rowIndex = workspace.rows.findIndex((row) => row.id === rowId);
  if (rowIndex === -1) throw new Error('The selected row no longer exists.');
  const finishedAt = Date.now();
  const row = workspace.rows[rowIndex];
  const before = row.values[column.id] ?? '';
  const grounded = result.citations.length > 0;
  const values = {
    ...row.values,
    [column.id]: result.answer,
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
    after: result.answer,
    provider: 'gemini',
    cached: result.cached,
    evidence: result.citations.map(
      (citation) => `${citation.title}: ${citation.url}`,
    ),
    references: result.citations,
    queries: result.queries,
  };

  return {
    workspace: { ...workspace, rows, updatedAt: finishedAt },
    receipt,
  };
}
