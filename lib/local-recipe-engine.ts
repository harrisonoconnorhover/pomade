import type {
  ActionReceipt,
  PomadeColumn,
  PomadeRow,
  RecipeRunCondition,
  RunReceipt,
  WorkspaceSnapshot,
} from './pomade-types';

function normalizeDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

const CUSTOM_FORMULA_MAX_LENGTH = 2_000;
const CUSTOM_FORMULA_OUTPUT_MAX_LENGTH = 4_000;

const customFormulaFilters: Record<string, (value: string) => string> = {
  domain: normalizeDomain,
  first: (value) => value.trim().split(/\s+/)[0] ?? '',
  lower: (value) => value.toLowerCase(),
  trim: (value) => value.trim(),
  upper: (value) => value.toUpperCase(),
};

/**
 * Render a deterministic, row-aware text formula without evaluating code.
 * Example: "{{person | first}} at {{company | upper}}".
 */
export function renderCustomFormula(expression: string, row: PomadeRow) {
  const template = expression.slice(0, CUSTOM_FORMULA_MAX_LENGTH);
  return template
    .replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, token: string) => {
      const [rawField, ...rawFilters] = token.split('|');
      const field = rawField.trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(field)) return '';
      return rawFilters.reduce((value, rawFilter) => {
        const filter = customFormulaFilters[rawFilter.trim().toLowerCase()];
        return filter ? filter(value) : value;
      }, row.values[field] ?? '');
    })
    .slice(0, CUSTOM_FORMULA_OUTPUT_MAX_LENGTH);
}

function stableScore(row: PomadeRow) {
  const source = `${row.values.company}|${row.values.person}|${row.values.title}|${row.values.domain}`;
  const hash = Array.from(source).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  const leadershipBoost = /(founder|chief|ceo|coo|president)/i.test(
    row.values.title ?? '',
  )
    ? 8
    : 0;
  return Math.min(96, 63 + (hash % 24) + leadershipBoost);
}

function emailDomain(input: string) {
  const email = input.trim().toLowerCase();
  const separator = email.lastIndexOf('@');
  return separator > 0 && separator < email.length - 1
    ? email.slice(separator + 1)
    : '';
}

function dedupeKey(row: PomadeRow) {
  const email = (row.values.email || row.values.apollo_email || '')
    .trim()
    .toLowerCase();
  if (email) return `email:${email}`;
  const person = (row.values.person || '').trim().toLowerCase();
  const domain = normalizeDomain(row.values.domain ?? '');
  return person && domain ? `person:${person}|${domain}` : '';
}

function runRecipe(column: PomadeColumn, row: PomadeRow) {
  const company = row.values.company || 'the company';
  const firstName = (row.values.person || '').split(' ')[0];

  switch (column.recipe) {
    case 'custom-formula':
      return renderCustomFormula(column.expression ?? '', row);
    case 'normalize-domain':
      return normalizeDomain(row.values.domain ?? '');
    case 'first-name':
      return (row.values.person || '').trim().split(/\s+/)[0] ?? '';
    case 'email-domain':
      return emailDomain(row.values.email || row.values.apollo_email || '');
    case 'dedupe-key':
      return dedupeKey(row);
    case 'score-fit': {
      const score = stableScore(row);
      return `${score >= 82 ? 'Strong' : 'Review'} · ${score}`;
    }
    case 'write-opener':
      return firstName
        ? `${firstName}, ${company} stands out for turning a complex operating problem into a clear customer experience.`
        : `${company} stands out for turning a complex operating problem into a clear customer experience.`;
    case 'company-summary':
      return `${company} is a target account being researched for a governed GTM workflow.`;
    default:
      return row.values[column.id] ?? '';
  }
}

export function matchesRunCondition(
  condition: RecipeRunCondition | undefined,
  row: PomadeRow,
) {
  if (!condition) return true;
  const actual = (row.values[condition.field] ?? '').trim();
  const expected = (condition.value ?? '').trim();
  const normalizedActual = actual.toLocaleLowerCase();
  const normalizedExpected = expected.toLocaleLowerCase();

  switch (condition.operator) {
    case 'is_not_empty':
      return actual.length > 0;
    case 'is_empty':
      return actual.length === 0;
    case 'equals':
      return normalizedActual === normalizedExpected;
    case 'not_equals':
      return normalizedActual !== normalizedExpected;
    case 'contains':
      return normalizedActual.includes(normalizedExpected);
    case 'not_contains':
      return !normalizedActual.includes(normalizedExpected);
  }
}

export function shouldRunRecipe(column: PomadeColumn, row: PomadeRow) {
  return matchesRunCondition(column.runCondition, row);
}

export function countEligibleRecipeActions(
  rows: PomadeRow[],
  columns: PomadeColumn[],
) {
  return rows.reduce(
    (count, row) =>
      count + columns.filter((column) => shouldRunRecipe(column, row)).length,
    0,
  );
}

export function recalculateAutomaticFormulas(
  row: PomadeRow,
  columns: PomadeColumn[],
  editedColumnId?: string,
) {
  const values = { ...row.values };
  for (const column of columns) {
    if (
      column.kind !== 'formula' ||
      !column.autoRun ||
      column.id === editedColumnId
    ) {
      continue;
    }
    const currentRow = { ...row, values };
    if (!shouldRunRecipe(column, currentRow)) continue;
    values[column.id] = runRecipe(column, currentRow);
  }
  return { ...row, values };
}

export function executeWorkspace(
  input: WorkspaceSnapshot,
  selectedRowIds?: string[],
): { workspace: WorkspaceSnapshot; run: RunReceipt } {
  const startedAt = Date.now();
  const recipeColumns = input.columns.filter(
    (column) =>
      (column.kind === 'formula' || column.kind === 'enrichment') &&
      column.recipe !== 'web-research',
  );
  const receipts: ActionReceipt[] = [];
  let skippedCount = 0;
  const selected = selectedRowIds ? new Set(selectedRowIds) : null;
  const targetRows = selected
    ? input.rows.filter((row) => selected.has(row.id))
    : input.rows;

  const rows = input.rows.map((row, rowIndex) => {
    if (selected && !selected.has(row.id)) return row;
    const values = { ...row.values };

    for (const [columnIndex, column] of recipeColumns.entries()) {
      if (!shouldRunRecipe(column, { ...row, values })) {
        skippedCount += 1;
        continue;
      }
      const before = values[column.id] ?? '';
      const after = runRecipe(column, { ...row, values });
      values[column.id] = after;
      receipts.push({
        id: `${row.id}-${column.id}-${startedAt}`,
        rowId: row.id,
        rowLabel: values.company || `Row ${rowIndex + 1}`,
        columnId: column.id,
        action: column.title,
        status: after ? 'passed' : 'review',
        durationMs: 18 + (((rowIndex + 1) * (columnIndex + 3) * 17) % 780),
        before,
        after,
      });
    }

    const hasRequiredFields = Boolean(values.company && values.domain);
    values.status = hasRequiredFields ? 'Ready' : 'Review';
    return { ...row, values };
  });

  const reviewCount = rows.filter(
    (row) =>
      (!selected || selected.has(row.id)) && row.values.status === 'Review',
  ).length;
  const finishedAt = Date.now();
  const run: RunReceipt = {
    id: crypto.randomUUID(),
    workspaceId: input.id,
    status: 'completed',
    startedAt,
    finishedAt,
    rowCount: targetRows.length,
    actionCount: receipts.length,
    passedCount: receipts.filter((receipt) => receipt.status === 'passed')
      .length,
    reviewCount,
    skippedCount,
    externalWrites: 0,
    receipts,
  };

  return { workspace: { ...input, rows, updatedAt: finishedAt }, run };
}
