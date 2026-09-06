import { rubricScoreValues } from './rubric-score';
import { matchesRunCondition } from './run-conditions';
export { matchesRunCondition } from './run-conditions';
import { createLookupResolver } from './table-lookup';
import type {
  ActionReceipt,
  PomadeColumn,
  PomadeRow,
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
export function renderCustomFormula(
  expression: string,
  row: PomadeRow,
  inputBindings?: Record<string, string>,
) {
  const template = expression.slice(0, CUSTOM_FORMULA_MAX_LENGTH);
  return template
    .replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, token: string) => {
      const [rawField, ...rawFilters] = token.split('|');
      const field = rawField.trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(field)) return '';
      const sourceField =
        inputBindings && Object.hasOwn(inputBindings, field)
          ? inputBindings[field]
          : field;
      return rawFilters.reduce(
        (value, rawFilter) => {
          const filter = customFormulaFilters[rawFilter.trim().toLowerCase()];
          return filter ? filter(value) : value;
        },
        sourceField ? (row.values[sourceField] ?? '') : '',
      );
    })
    .slice(0, CUSTOM_FORMULA_OUTPUT_MAX_LENGTH);
}

function recipeValue(column: PomadeColumn, row: PomadeRow, key: string) {
  const sourceField =
    column.inputBindings && Object.hasOwn(column.inputBindings, key)
      ? column.inputBindings[key]
      : key;
  return sourceField ? (row.values[sourceField] ?? '') : '';
}

function stableScore(column: PomadeColumn, row: PomadeRow) {
  const source = `${recipeValue(column, row, 'company')}|${recipeValue(column, row, 'person')}|${recipeValue(column, row, 'title')}|${recipeValue(column, row, 'domain')}`;
  const hash = Array.from(source).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  const leadershipBoost = /(founder|chief|ceo|coo|president)/i.test(
    recipeValue(column, row, 'title'),
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

function dedupeKey(column: PomadeColumn, row: PomadeRow) {
  const email = (
    recipeValue(column, row, 'email') ||
    recipeValue(column, row, 'apollo_email')
  )
    .trim()
    .toLowerCase();
  if (email) return `email:${email}`;
  const person = recipeValue(column, row, 'person').trim().toLowerCase();
  const domain = normalizeDomain(recipeValue(column, row, 'domain'));
  return person && domain ? `person:${person}|${domain}` : '';
}

function runRecipe(column: PomadeColumn, row: PomadeRow) {
  const company = recipeValue(column, row, 'company') || 'the company';
  const firstName = recipeValue(column, row, 'person').split(' ')[0];

  switch (column.recipe) {
    case 'custom-formula':
      return renderCustomFormula(
        column.expression ?? '',
        row,
        column.inputBindings,
      );
    case 'normalize-domain':
      return normalizeDomain(recipeValue(column, row, 'domain'));
    case 'first-name':
      return recipeValue(column, row, 'person').trim().split(/\s+/)[0] ?? '';
    case 'email-domain':
      return emailDomain(
        recipeValue(column, row, 'email') ||
          recipeValue(column, row, 'apollo_email'),
      );
    case 'dedupe-key':
      return dedupeKey(column, row);
    case 'score-fit': {
      const score = stableScore(column, row);
      return `${score >= 82 ? 'Strong' : 'Review'} · ${score}`;
    }
    case 'waterfall':
      return waterfallWinner(column, row).value;
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

function waterfallWinner(column: PomadeColumn, row: PomadeRow) {
  for (const step of column.waterfallSteps ?? []) {
    const value = recipeValue(column, row, step.field).trim();
    if (value) return { value, source: step.label };
  }
  return { value: '', source: '' };
}

function runRecipeOutputs(column: PomadeColumn, row: PomadeRow) {
  if (column.recipe === 'rubric-score') return rubricScoreValues(column, row);
  if (column.recipe === 'waterfall') {
    const winner = waterfallWinner(column, row);
    return {
      [column.id]: winner.value,
      ...(column.lineageColumnId
        ? { [column.lineageColumnId]: winner.source }
        : {}),
    };
  }
  return { [column.id]: runRecipe(column, row) };
}

export function shouldRunRecipe(column: PomadeColumn, row: PomadeRow) {
  if (
    column.recipe === 'web-research' &&
    column.outputCardinality === 'list' &&
    row.generatedByColumnId === column.id
  ) {
    return false;
  }
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
      column.recipe === 'table-lookup' ||
      column.recipe === 'http-api' ||
      column.recipe === 'http-waterfall'
    ) {
      continue;
    }
    if (column.id === editedColumnId) {
      if (column.recipe === 'waterfall' && column.lineageColumnId) {
        values[column.lineageColumnId] = 'Manual override';
      }
      continue;
    }
    if (editedColumnId && column.lineageColumnId === editedColumnId) continue;
    const currentRow = { ...row, values };
    if (!shouldRunRecipe(column, currentRow)) continue;
    Object.assign(values, runRecipeOutputs(column, currentRow));
  }
  return { ...row, values };
}

export function executeWorkspace(
  input: WorkspaceSnapshot,
  selectedRowIds?: string[],
  selectedColumnIds?: string[],
  lookupTables: Record<string, WorkspaceSnapshot> = {},
): { workspace: WorkspaceSnapshot; run: RunReceipt } {
  const startedAt = Date.now();
  const selectedColumns = selectedColumnIds ? new Set(selectedColumnIds) : null;
  const recipeColumns = input.columns.filter(
    (column) =>
      (column.kind === 'formula' || column.kind === 'enrichment') &&
      column.recipe !== 'web-research' &&
      column.recipe !== 'http-api' &&
      column.recipe !== 'http-waterfall' &&
      (!selectedColumns || selectedColumns.has(column.id)),
  );
  const lookupResolvers = new Map(
    recipeColumns
      .filter((column) => column.recipe === 'table-lookup')
      .map((column) => [
        column.id,
        createLookupResolver(
          column,
          lookupTables[column.lookup?.sourceTableId ?? ''],
        ),
      ]),
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
    let lookupNeedsReview = false;
    const receiptStart = receipts.length;

    for (const column of recipeColumns) {
      if (!shouldRunRecipe(column, { ...row, values })) {
        skippedCount += 1;
        continue;
      }
      const before = values[column.id] ?? '';
      const actionStartedAt = Date.now();
      const lookup = lookupResolvers.get(column.id)?.({ ...row, values });
      if (lookup && !lookup.passed) lookupNeedsReview = true;
      const outputValues =
        lookup?.values ?? runRecipeOutputs(column, { ...row, values });
      const after = outputValues[column.id] ?? '';
      Object.assign(values, outputValues);
      receipts.push({
        id: `${row.id}-${column.id}-${startedAt}`,
        rowId: row.id,
        rowLabel: values.company || `Row ${rowIndex + 1}`,
        columnId: column.id,
        action: column.title,
        status: (lookup ? lookup.passed : Boolean(after)) ? 'passed' : 'review',
        evidence: lookup?.evidence,
        provider: lookup ? 'local' : undefined,
        durationMs: Date.now() - actionStartedAt,
        before,
        after,
        outputValues:
          Object.keys(outputValues).length > 1 ? outputValues : undefined,
      });
    }

    if (receipts.length === receiptStart) return row;
    const hasRequiredFields = Boolean(values.company && values.domain);
    values.status =
      hasRequiredFields && !lookupNeedsReview ? 'Ready' : 'Review';
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
