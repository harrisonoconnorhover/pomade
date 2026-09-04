export type ColumnKind = 'text' | 'formula' | 'enrichment' | 'status';

export type PomadeColumn = {
  id: string;
  title: string;
  kind: ColumnKind;
  width: number;
  recipe?:
    | 'normalize-domain'
    | 'score-fit'
    | 'write-opener'
    | 'company-summary';
};

export type PomadeRow = {
  id: string;
  values: Record<string, string>;
};

export type WorkspaceSnapshot = {
  id: string;
  name: string;
  columns: PomadeColumn[];
  rows: PomadeRow[];
  updatedAt: number;
};

export type ActionReceipt = {
  id: string;
  rowId: string;
  rowLabel: string;
  columnId: string;
  action: string;
  status: 'passed' | 'review';
  durationMs: number;
  before: string;
  after: string;
  provider?: 'apollo';
  creditsConsumed?: number | null;
  cached?: boolean;
  evidence?: string[];
};

export type RunReceipt = {
  id: string;
  workspaceId: string;
  status: 'completed';
  startedAt: number;
  finishedAt: number;
  rowCount: number;
  actionCount: number;
  passedCount: number;
  reviewCount: number;
  externalWrites: 0;
  provider?: 'apollo' | 'local';
  creditsConsumed?: number | null;
  receipts: ActionReceipt[];
};

export type ApolloEnrichmentStatus = 'found' | 'needs_review' | 'not_found';

export type ApolloEnrichmentResult = {
  personId: string | null;
  fullName: string | null;
  title: string | null;
  workEmail: string | null;
  candidateEmail: string | null;
  emailStatus: string | null;
  linkedinUrl: string | null;
  location: string | null;
  organizationDomain: string | null;
  status: ApolloEnrichmentStatus;
  evidence: string[];
  creditsConsumed: number | null;
  cached: boolean;
};
