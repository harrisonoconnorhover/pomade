export type ColumnKind = 'text' | 'formula' | 'enrichment' | 'status';

export type RunConditionOperator =
  | 'is_not_empty'
  | 'is_empty'
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains';

export type RecipeRunCondition = {
  field: string;
  operator: RunConditionOperator;
  value?: string;
};

export type ResearchValueType = 'text' | 'number' | 'boolean' | 'date';

export type ResearchOutputCardinality = 'record' | 'list';

export type ResearchOutputField = {
  id: string;
  title: string;
  valueType: ResearchValueType;
};

export type WaterfallStep = {
  field: string;
  label: string;
};

export type PomadeColumn = {
  id: string;
  title: string;
  kind: ColumnKind;
  width: number;
  autoRun?: boolean;
  expression?: string;
  inputBindings?: Record<string, string>;
  lineageColumnId?: string;
  listDestinationBindings?: Record<string, string>;
  listLimit?: number;
  outputCardinality?: ResearchOutputCardinality;
  outputFields?: ResearchOutputField[];
  prompt?: string;
  runCondition?: RecipeRunCondition;
  valueType?: ResearchValueType;
  waterfallSteps?: WaterfallStep[];
  recipe?:
    | 'custom-formula'
    | 'normalize-domain'
    | 'first-name'
    | 'email-domain'
    | 'dedupe-key'
    | 'score-fit'
    | 'waterfall'
    | 'write-opener'
    | 'company-summary'
    | 'web-research';
};

export type RecipeTemplateInput = {
  key: string;
  title: string;
  sourceColumnId: string;
  required: boolean;
  purpose?: 'recipe' | 'condition';
};

export type RecipeTemplate = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  column: PomadeColumn;
  inputs: RecipeTemplateInput[];
};

export type RecipeScheduleCadence = 'once' | 'every_day' | 'every_week';

export type RecipeSchedule = {
  id: string;
  cadence: RecipeScheduleCadence;
  enabled: boolean;
  nextRunAt?: number;
  target: 'all' | 'selected';
  rowIds?: string[];
  confirmExternalResearch: true;
  state: 'active' | 'running' | 'complete' | 'failed' | 'paused';
  createdAt: number;
  updatedAt: number;
  lastAttemptAt?: number;
  leaseUntil?: number;
  lastRunAt?: number;
  lastRunId?: string;
  lastError?: string;
};

export type RunJobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export type RunJob = {
  id: string;
  workspaceId: string;
  status: RunJobStatus;
  rowIds: string[];
  columnIds?: string[];
  cursor: number;
  completedCount: number;
  skippedCount: number;
  confirmExternalResearch: boolean;
  createdAt: number;
  updatedAt: number;
  leaseUntil?: number;
  lastRunId?: string;
  lastError?: string;
};

export type PomadeRow = {
  id: string;
  generatedByColumnId?: string;
  generatedAt?: number;
  parentRowId?: string;
  values: Record<string, string>;
};

export type WorkspaceSnapshot = {
  id: string;
  name: string;
  columns: PomadeColumn[];
  rows: PomadeRow[];
  recipeTemplates?: RecipeTemplate[];
  schedule?: RecipeSchedule;
  updatedAt: number;
  source?: WorkspaceSource;
};

export type WorkspaceSource = {
  provider: 'sample' | 'csv' | 'hubspot' | 'salesforce';
  label: string;
  importedAt: number;
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
  provider?: 'apollo' | 'gemini' | 'parallel' | 'local';
  creditsConsumed?: number | null;
  cached?: boolean;
  evidence?: string[];
  createdRowCount?: number;
  createdRowIds?: string[];
  outputValues?: Record<string, string>;
  references?: WebResearchCitation[];
  queries?: string[];
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
  skippedCount?: number;
  externalWrites: 0;
  provider?: 'apollo' | 'gemini' | 'parallel' | 'local' | 'mixed';
  researchProvider?: 'gemini' | 'parallel';
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

export type WebResearchCitation = {
  title: string;
  url: string;
};

export type WebResearchResult = {
  answer: string;
  citations: WebResearchCitation[];
  queries: string[];
  model: string;
  cached: boolean;
};

export type CrmProvider = 'hubspot' | 'salesforce';

export type CrmSourceContact = {
  nativeId: string;
  objectType: 'contact' | 'lead';
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  phone: string;
  jobTitle: string;
  website: string;
};

export type CrmSourcePreview = {
  provider: CrmProvider;
  sourceLabel: string;
  contacts: CrmSourceContact[];
  truncated: boolean;
  readAt: string;
};
