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

export function executeWorkspace(
  input: WorkspaceSnapshot,
  selectedRowIds?: string[],
): { workspace: WorkspaceSnapshot; run: RunReceipt } {
  const startedAt = Date.now();
  const recipeColumns = input.columns.filter(
    (column) => column.kind === 'formula' || column.kind === 'enrichment',
  );
  const receipts: ActionReceipt[] = [];
  const selected = selectedRowIds ? new Set(selectedRowIds) : null;
  const targetRows = selected
    ? input.rows.filter((row) => selected.has(row.id))
    : input.rows;

  const rows = input.rows.map((row, rowIndex) => {
    if (selected && !selected.has(row.id)) return row;
    const values = { ...row.values };

    for (const [columnIndex, column] of recipeColumns.entries()) {
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
    externalWrites: 0,
    receipts,
  };

  return { workspace: { ...input, rows, updatedAt: finishedAt }, run };
}
