import type {
  ActionReceipt,
  ApolloEnrichmentResult,
  PomadeColumn,
  RunReceipt,
  WorkspaceSnapshot,
} from './pomade-types';

const outputColumns: PomadeColumn[] = [
  { id: 'apollo_email', title: 'Work email', kind: 'text', width: 220 },
  { id: 'apollo_match', title: 'Apollo match', kind: 'text', width: 160 },
  { id: 'apollo_title', title: 'Apollo title', kind: 'text', width: 190 },
  { id: 'apollo_linkedin', title: 'LinkedIn', kind: 'text', width: 240 },
  { id: 'apollo_location', title: 'Apollo location', kind: 'text', width: 190 },
  { id: 'apollo_credits', title: 'Apollo credits', kind: 'text', width: 140 },
];

function withOutputColumns(columns: PomadeColumn[]) {
  const known = new Set(columns.map((column) => column.id));
  const additions = outputColumns.filter((column) => !known.has(column.id));
  const statusIndex = columns.findIndex((column) => column.kind === 'status');
  if (statusIndex === -1) return [...columns, ...additions];
  return [
    ...columns.slice(0, statusIndex),
    ...additions,
    ...columns.slice(statusIndex),
  ];
}

function matchLabel(result: ApolloEnrichmentResult) {
  if (result.status === 'found') return 'Verified';
  if (result.status === 'not_found') return 'Not found';
  return result.candidateEmail ? 'Review email' : 'Review identity';
}

export type ApolloBatchEnrichmentEntry = {
  rowId: string;
  result: ApolloEnrichmentResult;
};

function enrichedValues(
  values: Record<string, string>,
  result: ApolloEnrichmentResult,
): Record<string, string> {
  return {
    ...values,
    apollo_email: result.workEmail ?? '',
    apollo_match: matchLabel(result),
    apollo_title: result.title ?? '',
    apollo_linkedin: result.linkedinUrl ?? '',
    apollo_location: result.location ?? '',
    apollo_credits: result.cached
      ? '0 · cached'
      : result.creditsConsumed === null
        ? 'Not reported'
        : String(result.creditsConsumed),
    __apollo_person_id: result.personId ?? '',
    __apollo_candidate_email: result.candidateEmail ?? '',
    __apollo_evidence: result.evidence.join(' '),
    status: result.status === 'found' ? 'Ready' : 'Review',
  };
}

export function applyApolloBatchEnrichment(
  workspace: WorkspaceSnapshot,
  entries: ApolloBatchEnrichmentEntry[],
  startedAt: number,
): { workspace: WorkspaceSnapshot; run: RunReceipt } {
  if (!entries.length)
    throw new Error('At least one Apollo result is required.');
  const resultByRow = new Map(
    entries.map((entry) => [entry.rowId, entry.result]),
  );
  if (resultByRow.size !== entries.length) {
    throw new Error('Apollo batch results must target unique rows.');
  }
  for (const rowId of resultByRow.keys()) {
    if (!workspace.rows.some((row) => row.id === rowId)) {
      throw new Error('The selected row no longer exists.');
    }
  }

  const finishedAt = Date.now();
  const receipts: ActionReceipt[] = [];
  const rows = workspace.rows.map((row, rowIndex) => {
    const result = resultByRow.get(row.id);
    if (!result) return row;
    const before = row.values.apollo_email ?? '';
    const values = enrichedValues(row.values, result);
    const after = result.workEmail ?? result.candidateEmail ?? '';
    receipts.push({
      id: `${row.id}-apollo-${startedAt}`,
      rowId: row.id,
      rowLabel: values.company || values.person || `Row ${rowIndex + 1}`,
      columnId: 'apollo_email',
      action: 'Apollo person enrichment',
      status: result.status === 'found' ? 'passed' : 'review',
      durationMs: Math.max(1, finishedAt - startedAt),
      before,
      after: after || matchLabel(result),
      provider: 'apollo',
      creditsConsumed: result.creditsConsumed,
      cached: result.cached,
      evidence: result.evidence,
    });
    return { ...row, values };
  });
  const reportedCredits = entries.map((entry) => entry.result.creditsConsumed);
  const creditsConsumed = reportedCredits.some((credits) => credits === null)
    ? null
    : reportedCredits.reduce<number>(
        (total, credits) => total + (credits ?? 0),
        0,
      );
  const run: RunReceipt = {
    id: crypto.randomUUID(),
    workspaceId: workspace.id,
    status: 'completed',
    startedAt,
    finishedAt,
    rowCount: entries.length,
    actionCount: entries.length,
    passedCount: receipts.filter((receipt) => receipt.status === 'passed')
      .length,
    reviewCount: receipts.filter((receipt) => receipt.status === 'review')
      .length,
    externalWrites: 0,
    provider: 'apollo',
    creditsConsumed,
    receipts,
  };

  return {
    workspace: {
      ...workspace,
      columns: withOutputColumns(workspace.columns),
      rows,
      updatedAt: finishedAt,
    },
    run,
  };
}

export function applyApolloEnrichment(
  workspace: WorkspaceSnapshot,
  rowId: string,
  result: ApolloEnrichmentResult,
  startedAt: number,
): { workspace: WorkspaceSnapshot; run: RunReceipt } {
  return applyApolloBatchEnrichment(workspace, [{ rowId, result }], startedAt);
}
