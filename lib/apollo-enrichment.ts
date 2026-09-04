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

export function applyApolloEnrichment(
  workspace: WorkspaceSnapshot,
  rowId: string,
  result: ApolloEnrichmentResult,
  startedAt: number,
): { workspace: WorkspaceSnapshot; run: RunReceipt } {
  const rowIndex = workspace.rows.findIndex((row) => row.id === rowId);
  if (rowIndex === -1) throw new Error('The selected row no longer exists.');
  const finishedAt = Date.now();
  const before = workspace.rows[rowIndex].values.apollo_email ?? '';
  const after = result.workEmail ?? result.candidateEmail ?? '';
  const values: Record<string, string> = {
    ...workspace.rows[rowIndex].values,
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
  const rows = workspace.rows.map((row, index) =>
    index === rowIndex ? { ...row, values } : row,
  );
  const label = values.company || values.person || `Row ${rowIndex + 1}`;
  const receipt: ActionReceipt = {
    id: `${rowId}-apollo-${startedAt}`,
    rowId,
    rowLabel: label,
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
  };
  const run: RunReceipt = {
    id: crypto.randomUUID(),
    workspaceId: workspace.id,
    status: 'completed',
    startedAt,
    finishedAt,
    rowCount: 1,
    actionCount: 1,
    passedCount: receipt.status === 'passed' ? 1 : 0,
    reviewCount: receipt.status === 'review' ? 1 : 0,
    externalWrites: 0,
    provider: 'apollo',
    creditsConsumed: result.creditsConsumed,
    receipts: [receipt],
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
