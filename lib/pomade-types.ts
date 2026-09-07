export type ColumnKind = 'text' | 'formula' | 'enrichment' | 'status';

export type RunConditionOperator =
  | 'is_not_empty'
  | 'is_empty'
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal';

export type RecipeConditionRule = {
  field: string;
  operator: RunConditionOperator;
  value?: string;
};

export type RecipeRunCondition =
  | RecipeConditionRule
  | {
      mode: 'all' | 'any';
      rules: RecipeConditionRule[];
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

export type TableLookup = {
  comparison?: 'equals' | 'contains';
  resultMode?: 'unique' | 'list' | 'count' | 'sum' | 'average' | 'min' | 'max';
  sourceTableId: string;
  sourceMatchColumnId: string;
  normalization: 'exact' | 'text' | 'domain';
  outputs: { sourceColumnId: string; outputColumnId: string }[];
  statusColumnId: string;
};

export type HttpRecipe = {
  preset?: 'apollo-company' | 'pdl-company';
  presetInputKey?: string;
  connectionId: string;
  method: 'GET' | 'POST';
  pathTemplate: string;
  bodyTemplate?: string;
  outputs: { path: string; outputColumnId: string }[];
  statusColumnId: string;
};

export type HttpProviderStep = {
  verifier?: { presetId: string };
  connectionId: string;
  method: 'GET' | 'POST';
  pathTemplate: string;
  bodyTemplate?: string;
  responsePath: string;
  verification?: {
    path: string;
    acceptedValues: string[];
    revealedPath?: string;
  };
};
export type ProviderWaterfall = {
  steps: HttpProviderStep[];
  accept: 'nonempty' | 'email' | 'phone' | 'verified-email' | 'verified-phone';
  continueOnError: boolean;
  winnerColumnId: string;
  statusColumnId: string;
};
export type PomadeColumn = {
  hidden?: boolean;
  researchProvider?: 'codex' | 'parallel' | 'gemini';
  rubricScore?: import('./rubric-score').RubricScore;
  codexResearch?: import('./codex-models.mjs').CodexResearchSettings;
  functionInstance?: {
    id: string;
    definitionId: string;
    version?: number;
    bindings?: Record<string, string>;
    name: string;
    step: number;
    total: number;
  };
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
  lookup?: TableLookup;
  http?: HttpRecipe;
  providerWaterfall?: ProviderWaterfall;
  recipe?:
    | 'http-api'
    | 'http-waterfall'
    | 'table-lookup'
    | 'custom-formula'
    | 'normalize-domain'
    | 'first-name'
    | 'email-domain'
    | 'dedupe-key'
    | 'score-fit'
    | 'rubric-score'
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

export type RecipeFunctionVersion = {
  version: number;
  createdAt: number;
  steps: RecipeTemplate[];
  inputs: RecipeTemplateInput[];
};
export type RecipeFunction = {
  version?: number;
  history?: RecipeFunctionVersion[];
  id: string;
  name: string;
  createdAt: number;
  steps: RecipeTemplate[];
  inputs: RecipeTemplateInput[];
};

export type RecipeScheduleCadence = 'once' | 'every_day' | 'every_week';

export type ScheduledCrmWrite = {
  mappingId: string;
  name: string;
  config: import('./crm-sync').CrmSyncConfig;
  condition?: RecipeRunCondition;
};
export type RecipeSchedule = {
  jobId?: string;
  sourceExecutionId?: string;
  executionFingerprint?: string;
  executionId?: string;
  afterRunCrm?: ScheduledCrmWrite[];
  lastCrmPlanIds?: string[];
  beforeRunSource?: import('./api-source').ApiSourceRefresh;
  lastSourceBatchId?: string;
  functionInstanceId?: string;
  afterRunTransfer?: TableTransferRule;
  afterRunTransfers?: TableTransferRule[];
  lastTransferRunIds?: string[];
  lastTransferRunId?: string;
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
  | 'cancelled'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export type RunJob = {
  scheduleExecutionId?: string;
  nextCheckAt?: number;
  waitingMessage?: string;
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
  apiSource?: { batchId: string; connectionId: string; fetchedAt: number };
  webhookSource?: { sourceId: string; eventId: string; receivedAt: number };
  sourceRecord?: { tableId: string; rowId: string; tableName: string };
  id: string;
  generatedByColumnId?: string;
  generatedAt?: number;
  parentRowId?: string;
  values: Record<string, string>;
};

export type SavedView = {
  id: string;
  name: string;
  columnId: string;
  operator: RunConditionOperator;
  value?: string;
  createdAt: number;
};

export type TableTransferRule = {
  condition?: RecipeRunCondition;
  rowScope?: 'source' | 'children' | 'source_and_children';
  childRecipeId?: string;
  id: string;
  name: string;
  targetTableId: string;
  sourceKey: string;
  targetKey: string;
  normalization: TableLookup['normalization'];
  mode: 'add' | 'update' | 'upsert';
  skipBlank: boolean;
  mapping: Record<string, string>;
};
export type WorkspaceSnapshot = {
  workbookPlan?: import('./workbook-planner').WorkbookPlanGuide;
  crmMappings?: import('./crm-mappings').CrmMapping[];
  signalWatches?: import('./change-signals').SignalWatch[];
  signalFeedFields?: boolean;
  apiSourceRefresh?: import('./api-source').ApiSourceRefresh;
  tableTransfers?: TableTransferRule[];
  revision?: number;
  webhookAutoImport?: Record<string, boolean>;
  webhookImportErrors?: Record<string, string>;
  id: string;
  name: string;
  columns: PomadeColumn[];
  rows: PomadeRow[];
  webhookMappings?: Record<string, Record<string, string>>;
  recipeTemplates?: RecipeTemplate[];
  recipeFunctions?: RecipeFunction[];
  savedViews?: SavedView[];
  schedule?: RecipeSchedule;
  updatedAt: number;
  source?: WorkspaceSource;
};

export type WorkspaceVersionSummary = {
  id: string;
  reason: string;
  createdAt: number;
  rowCount: number;
  columnCount: number;
  sourceLabel?: string;
};

export type WorkspaceSource = {
  objectType?: CrmObjectType;
  fields?: string[];
  segment?: HubSpotSegment;
  provider: 'sample' | 'csv' | 'hubspot' | 'salesforce';
  label: string;
  importedAt: number;
};

export type ActionReceipt = {
  providerConnectionId?: string;
  providerLabel?: string;
  operationId?: string;
  operationRole?: 'lookup' | 'verification';
  operationPhase?: 'request' | 'submission' | 'result-check';
  outcome?: 'candidate' | 'accepted' | 'rejected' | 'pending' | 'error';
  waterfallStep?: number;
  startedAt?: number;
  finishedAt?: number;
  nextCheckAt?: number;
  creditsReported?: boolean;
  reportedCreditTotal?: number;
  researchModel?: string;
  reasoningEffort?: string;
  pending?: boolean;
  stopWaterfall?: boolean;
  httpRequestCount?: number;
  attempts?: ActionReceipt[];
  id: string;
  rowId: string;
  rowLabel: string;
  columnId: string;
  action: string;
  status: 'passed' | 'review';
  durationMs: number;
  before: string;
  after: string;
  provider?: 'apollo' | 'gemini' | 'parallel' | 'codex' | 'http' | 'local';
  creditsConsumed?: number | null;
  cached?: boolean;
  evidence?: string[];
  error?: string;
  createdRowCount?: number;
  createdRowIds?: string[];
  outputValues?: Record<string, string>;
  references?: WebResearchCitation[];
  browserVisits?: BrowserResearchVisit[];
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
  externalWrites: 0 | 'unknown';
  provider?:
    | 'apollo'
    | 'gemini'
    | 'parallel'
    | 'codex'
    | 'http'
    | 'local'
    | 'mixed';
  researchProvider?: 'gemini' | 'parallel' | 'codex';
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

export type BrowserResearchVisit = {
  requestedUrl: string;
  url: string;
  title: string;
  status: 'read' | 'blocked' | 'rate_limited' | 'error';
  visitedAt: string;
  httpStatus?: number;
  truncated: boolean;
  error?: string;
};

export type WebResearchCitation = {
  excerpt?: string;
  visitedAt?: string;
  title: string;
  url: string;
};

export type WebResearchResult = {
  reasoningEffort?: string;
  browserVisits?: BrowserResearchVisit[];
  answer: string;
  citations: WebResearchCitation[];
  queries: string[];
  model: string;
  cached: boolean;
};

export type CrmProvider = 'hubspot' | 'salesforce';
export type CrmObjectType = 'contact' | 'company' | 'lead' | 'account';

export type CrmSourceContact = {
  properties?: Record<string, string>;
  nativeId: string;
  objectType: CrmObjectType;
  description?: string;
  accountId?: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  phone: string;
  jobTitle: string;
  website: string;
};

export type HubSpotSegment = {
  id: string;
  name: string;
  objectType: 'contact' | 'company';
  processingType: string;
  size?: number;
};

export type CrmSourcePreview = {
  objectType?: CrmObjectType;
  segment?: HubSpotSegment;
  nextAfter?: string;
  fields?: string[];
  provider: CrmProvider;
  sourceLabel: string;
  contacts: CrmSourceContact[];
  truncated: boolean;
  readAt: string;
};
