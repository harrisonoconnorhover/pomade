'use client';

import { hasAsyncProvider } from '@/lib/async-provider';

import {
  RESEARCH_RECIPES,
  PERSONAL_OPENER_RECIPE,
  prepareResearchRecipe,
} from '@/lib/research-recipes';

import {
  Copy,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  BookmarkPlus,
  Braces,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Cloud,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  FunctionSquare,
  Globe2,
  History,
  Library,
  LoaderCircle,
  MailCheck,
  Pause,
  Phone,
  Play,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  Users,
  WandSparkles,
  PanelLeft,
  PanelRight,
  AlignJustify,
  Info,
  X,
  Pencil,
  Workflow,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import RunScopePicker from '@/components/run-scope-picker';
import { runBudget } from '@/lib/run-budget';
import { changeResearchDraftMode } from '@/lib/research-draft';
import { runJobLocksWorkspace } from '@/lib/run-job';
import { reconcileWorkspaceUpdate } from '@/lib/workspace-merge';
import { applyGridEdits, visibleSelection } from '@/lib/grid-edits';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import ProviderWaterfallBuilder from '@/components/provider-waterfall-builder';
import ResearchConnectionStatus, {
  type ResearchProviderStatus,
} from '@/components/research-connection-status';
import HttpRecipeBuilder from '@/components/http-recipe-builder';
import { mergeWorkspaceEdits } from '@/lib/workspace-merge';
import { functionStepIds } from '@/lib/recipe-functions';
import ProviderPresetBuilder from '@/components/provider-preset-builder';
import ColumnFinder from '@/components/column-finder';
import ProviderCatalog from '@/components/provider-catalog';
import {
  catalogConnectionStatus,
  PROVIDER_CATALOG,
  type CatalogAction,
  type CatalogCategory,
} from '@/lib/provider-catalog';
import ChangeSignals from '@/components/change-signals';
import RecipeFunctionBuilder from '@/components/recipe-function-builder';
import TableTransferBuilder from '@/components/table-transfer-builder';
import ResearchProviderPicker from '@/components/research-provider-picker';
import ProviderAccounts from '@/components/provider-accounts';
import CrmRefreshPanel from '@/components/crm-refresh-panel';
import WorkbookPlanGuide from '@/components/workbook-plan-guide';
import ApiSourceBuilder from '@/components/api-source-builder';
import WebhookInbox from '@/components/webhook-inbox';
import {
  countMaximumExternalActions,
  isExternalRecipe,
} from '@/lib/external-recipes';
import TableLookupBuilder from '@/components/table-lookup-builder';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import RunConditionEditor from './run-condition-editor';
import { conditionOperators, conditionNeedsValue } from '@/lib/run-conditions';
import CrmSyncBuilder from './crm-sync-builder';
import HubSpotSegmentPicker from './hubspot-segment-picker';
import CrmImportReview from './crm-import-review';
import {
  CodexDefaultsEditor,
  CodexModelPicker,
  useCodexResearchSettings,
} from './codex-research-settings';
import type { CodexResearchSettings } from '@/lib/codex-models.mjs';
import {
  applyCrmImport,
  mergeCrmSourcePages,
  savedCrmSource,
  reviewCrmImport,
  type SavedCrmSource,
  type CrmImportMode,
} from '@/lib/crm-import';
import {
  deleteWorkspaceColumn,
  findColumnDependencies,
  renameWorkspaceColumn,
  researchSettingsChanged,
  updateResearchColumnSettings,
  updateWaterfallColumnOrder,
} from '@/lib/column-management';
import { createCompanyListWorkspace } from '@/lib/company-list-builder';
import {
  CONTROL_TOWER_FIELD_SPECS,
  suggestControlTowerMappings,
  toControlTowerPreview,
  type ControlTowerContactField,
  type ControlTowerFieldMapping,
} from '@/lib/control-tower-adapter';
import {
  recalculateAutomaticFormulas,
  renderCustomFormula,
} from '@/lib/local-recipe-engine';
import {
  addWorkspaceDataColumn,
  columnCapacityError,
  moveVisibleWorkspaceColumn,
  setWorkspaceColumnHidden,
  showAllWorkspaceColumns,
  resizeWorkspaceColumn,
} from '@/lib/grid-columns';
import { createPeopleListWorkspace } from '@/lib/people-list-builder';
import RunPreview from '@/components/run-preview';
import type {
  ApolloEnrichmentResult,
  CrmProvider,
  CrmSourcePreview,
  PomadeColumn,
  PomadeRow,
  RecipeScheduleCadence,
  RecipeTemplate,
  ResearchValueType,
  RunJob,
  RunReceipt,
  RunConditionOperator,
  WaterfallStep,
  WorkspaceSnapshot,
  WorkspaceVersionSummary,
} from '@/lib/pomade-types';
import {
  createRecipeTemplate,
  defaultTemplateBindings,
  instantiateRecipeTemplate,
} from '@/lib/recipe-templates';
import {
  createRecipeSchedule,
  pauseRecipeSchedule,
} from '@/lib/recipe-schedule';
import { deleteWorkspaceRows } from '@/lib/row-management';
import { createSavedView, rowMatchesSavedView } from '@/lib/saved-views';
import {
  exportRecipeFile,
  importRecipeFile,
  MAX_RECIPE_FILE_BYTES,
} from '@/lib/recipe-file';
import { summarizeTable, type TableSummary } from '@/lib/workbook';
import { summarizeRecentUsage } from '@/lib/usage-summary';
import ProviderPerformancePanel from './provider-performance';
import {
  MAX_BACKGROUND_RESEARCH_ACTIONS,
  MAX_BACKGROUND_ROWS,
  canPauseRunJob,
  canResumeRunJob,
  runJobPercent,
} from '@/lib/run-job';
import { createSampleWorkspace } from '@/lib/sample-workspace';

function CsvDialogLoading() {
  return (
    <Dialog open>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Opening CSV tools…</DialogTitle>
          <DialogDescription>
            Loading the preview and column controls.
          </DialogDescription>
        </DialogHeader>
        <LoaderCircle className="spin" aria-label="Loading CSV tools" />
      </DialogContent>
    </Dialog>
  );
}
const CsvImportDialog = dynamic(
  () => import('@/components/csv-import-dialog'),
  { ssr: false, loading: CsvDialogLoading },
);
const CsvExportDialog = dynamic(
  () => import('@/components/csv-export-dialog'),
  { ssr: false, loading: CsvDialogLoading },
);

const PomadeDataGrid = dynamic(() => import('@/components/pomade-data-grid'), {
  ssr: false,
  loading: () => <div className="grid-loading">Shaping your workspace…</div>,
});

type SaveState = 'Loading' | 'Saving' | 'Saved' | 'Offline';
type ResearchOutputMode = 'single' | 'structured' | 'list';
type PendingRunMode = 'immediate' | 'background';

type ResearchFieldDraft = {
  key: string;
  title: string;
  valueType: ResearchValueType;
};

type WaterfallStepDraft = {
  key: string;
  field: string;
};

type ApolloProviderStatus = {
  configured: boolean;
  capabilities: {
    personMatch: boolean;
    verifiedWorkEmail: boolean;
    phoneReveal: boolean;
  };
};

type ApolloBatchSummary = {
  requested: number;
  completed: number;
  failed: number;
  skipped: number;
  creditsConsumed: number | null;
};

type CrmCatalogStatus = {
  providers: Record<
    CrmProvider,
    { configured: boolean; label: string; mode: 'read_only' }
  >;
};

type RecipePreset = Pick<
  PomadeColumn,
  | 'title'
  | 'kind'
  | 'autoRun'
  | 'expression'
  | 'prompt'
  | 'codexResearch'
  | 'researchProvider'
  | 'recipe'
  | 'runCondition'
  | 'width'
> & {
  group: 'Transform' | 'Research';
  description: string;
  requires: string;
};

const DEFAULT_RESEARCH_PROMPT =
  'Find one recent, credible development about {{company}} ({{domain}}) that would be useful in a sales conversation. Include the date and why it matters.';

const DEFAULT_LIST_RESEARCH_PROMPT =
  'Find relevant companies matching the target described in this row. Return the strongest matches with a canonical domain and a concise reason each company fits.';

function defaultResearchFields(): ResearchFieldDraft[] {
  return [
    { key: 'trigger', title: 'Recent trigger', valueType: 'text' },
    { key: 'date', title: 'Trigger date', valueType: 'date' },
    { key: 'why', title: 'Why it matters', valueType: 'text' },
    { key: 'confidence', title: 'Confidence', valueType: 'number' },
  ];
}

function defaultListResearchFields(): ResearchFieldDraft[] {
  return [
    { key: 'company', title: 'Company name', valueType: 'text' },
    { key: 'domain', title: 'Domain', valueType: 'text' },
    { key: 'fit_reason', title: 'Why it fits', valueType: 'text' },
  ];
}

const recipePresets: RecipePreset[] = [
  {
    title: 'Custom formula',
    kind: 'formula',
    recipe: 'custom-formula',
    autoRun: true,
    width: 280,
    group: 'Transform',
    description:
      'Merge columns and transform their values with a live preview.',
    requires: 'Any visible columns',
  },
  {
    title: 'Data waterfall',
    kind: 'formula',
    recipe: 'waterfall',
    autoRun: true,
    width: 240,
    group: 'Transform',
    description:
      'Choose the first available value from ordered enrichment columns.',
    requires: 'Two or more source columns',
  },
  {
    title: 'Normalized domain',
    kind: 'formula',
    recipe: 'normalize-domain',
    autoRun: true,
    width: 190,
    group: 'Transform',
    description: 'Strip protocols, paths, and www from a company website.',
    requires: 'Company domain',
  },
  {
    title: 'First name',
    kind: 'formula',
    recipe: 'first-name',
    autoRun: true,
    width: 150,
    group: 'Transform',
    description: 'Pull a greeting-ready first name from the person field.',
    requires: 'Person',
  },
  {
    title: 'Email domain',
    kind: 'formula',
    recipe: 'email-domain',
    autoRun: true,
    width: 180,
    group: 'Transform',
    description: 'Extract the domain from an imported or Apollo email.',
    requires: 'Work email',
  },
  {
    title: 'Dedupe key',
    kind: 'formula',
    recipe: 'dedupe-key',
    autoRun: true,
    width: 260,
    group: 'Transform',
    description: 'Build a stable email-first identity key for review.',
    requires: 'Email or person + domain',
  },
  {
    title: 'AI web research',
    kind: 'enrichment',
    recipe: 'web-research',
    prompt: DEFAULT_RESEARCH_PROMPT,
    width: 380,
    group: 'Research',
    description:
      'Ask a custom row-by-row question using live public web research.',
    requires: 'Connected research provider + company context',
  },
  {
    title: 'ICP fit',
    kind: 'enrichment',
    recipe: 'score-fit',
    width: 180,
    group: 'Research',
    description: 'Score each row with the safe deterministic demo runner.',
    requires: 'Company + title',
  },
  {
    title: 'Personal opener',
    kind: 'enrichment',
    recipe: 'write-opener',
    width: 330,
    group: 'Research',
    description: PERSONAL_OPENER_RECIPE.description!,
    requires: 'Company website + research provider',
  },
  {
    title: 'Company summary',
    kind: 'enrichment',
    recipe: 'company-summary',
    width: 300,
    group: 'Research',
    description: 'Create a concise account-research summary.',
    requires: 'Company',
  },
];

const emptyCrmCatalog: CrmCatalogStatus = {
  providers: {
    hubspot: {
      configured: false,
      label: 'HubSpot contacts',
      mode: 'read_only',
    },
    salesforce: {
      configured: false,
      label: 'Salesforce leads',
      mode: 'read_only',
    },
  },
};

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'column'
  );
}

function uniqueId(base: string, used: Set<string>) {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

function uniqueTitle(title: string, used: Set<string>) {
  let candidate = title;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${title} ${suffix++}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function runTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

function dateTimeInputValue(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function defaultScheduleTime() {
  const date = new Date(Date.now() + 30 * 60_000);
  date.setSeconds(0, 0);
  return dateTimeInputValue(date.getTime());
}

function cadenceLabel(cadence: RecipeScheduleCadence) {
  if (cadence === 'every_day') return 'Every 24 hours';
  if (cadence === 'every_week') return 'Every 7 days';
  return 'One time';
}

function providerLabel(run?: RunReceipt) {
  if (run?.provider === 'http') return 'HTTP API';
  if (run?.provider === 'apollo') return 'Apollo';
  if (run?.provider === 'codex') return 'Codex subscription research';
  if (run?.provider === 'parallel') return 'Parallel research';
  if (run?.provider === 'gemini') return 'Gemini research';
  if (run?.provider === 'mixed') return 'Pomade + providers';
  return 'Pomade runner';
}

export default function PomadeWorkspace({
  deployment,
  workspaceId,
  initialRowId = '',
  onTableState,
  onOpenTable,
  onTableCreated,
  onCopyRows,
}: {
  deployment: { hosted: boolean; label: string; schedulesEnabled: boolean };
  workspaceId: string;
  initialRowId?: string;
  onTableState: (summary: TableSummary, canLeave: boolean) => void;
  onOpenTable: (tableId: string, rowId?: string) => void;
  onCopyRows: (rowIds: string[]) => void;
  onTableCreated: (table: TableSummary) => void;
}) {
  const workspaceUrl = `/api/workspace?workspaceId=${encodeURIComponent(workspaceId)}`;
  const versionsUrl = `/api/workspace/versions?workspaceId=${encodeURIComponent(workspaceId)}`;
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(() => ({
    ...createSampleWorkspace(),
    id: workspaceId,
    rows: [],
  }));
  const [activeRowId, setActiveRowId] = useState('sample-1');
  const [selectedRowStateIds, setSelectedRowIds] = useState<string[]>([]);
  const [runHistory, setRunHistory] = useState<RunReceipt[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [latestRun, setLatestRun] = useState<RunReceipt>();
  const [receiptRun, setReceiptRun] = useState<RunReceipt>();
  const [saveState, setSaveState] = useState<SaveState>('Loading');
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState('All');
  const [activeSavedViewId, setActiveSavedViewId] = useState('');
  const [query, setQuery] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [sortAscending, setSortAscending] = useState(true);
  const [notice, setNotice] = useState('');
  const [toolGroup, setToolGroup] = useState<
    'data' | 'enrich' | 'automate' | 'send' | ''
  >('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [compactRows, setCompactRows] = useState(false);
  const [recipeQuery, setRecipeQuery] = useState('');
  const [columnJump, setColumnJump] = useState<{
    id: string;
    revision: number;
  }>();
  const finishColumnJump = useCallback(() => setColumnJump(undefined), []);
  const [rowJump, setRowJump] = useState<{ id: string; revision: number }>();
  const finishRowJump = useCallback(() => setRowJump(undefined), []);
  const gridColumns = useMemo(
    () => workspace.columns.filter((column) => !column.hidden),
    [workspace.columns],
  );
  function toggleDensity() {
    const next = !compactRows;
    setCompactRows(next);
    try {
      localStorage.setItem('pomade:compact-rows', String(next));
    } catch {
      /* Keep the current session preference. */
    }
  }
  function clearView() {
    setQuery('');
    setFilter('All');
    setActiveSavedViewId('');
    setSelectedRowIds([]);
  }
  const matchesRecipe = (...values: (string | undefined)[]) =>
    recipeQuery
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .every((word) => values.join(' ').toLocaleLowerCase().includes(word));

  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [dataColumnOpen, setDataColumnOpen] = useState(false);
  const [dataColumnName, setDataColumnName] = useState('');
  const [dataColumnType, setDataColumnType] =
    useState<ResearchValueType>('text');
  const [dataColumnError, setDataColumnError] = useState('');
  const [lookupBuilderOpen, setLookupBuilderOpen] = useState(false);
  const [providerBuilderOpen, setProviderBuilderOpen] = useState(false);
  const [catalogCategory, setCatalogCategory] = useState<CatalogCategory>();
  const [providerSelection, setProviderSelection] = useState<{
    id?: string;
    revision: number;
  }>({ revision: 0 });
  const [companyProvider, setCompanyProvider] = useState<'apollo' | 'pdl'>();
  const [researchBuilderProvider, setResearchBuilderProvider] =
    useState<PomadeColumn['researchProvider']>();
  function openProviderCatalog(category: CatalogCategory = 'all') {
    setAddColumnOpen(false);
    setCatalogCategory(category);
  }
  function openProviderWaterfall(presetId?: string) {
    setCatalogCategory(undefined);
    setProviderSelection((current) => ({
      id: presetId,
      revision: current.revision + 1,
    }));
    setProviderBuilderOpen(true);
  }
  function chooseProvider(action: CatalogAction) {
    setCatalogCategory(undefined);
    if (action.target.type === 'contact')
      openProviderWaterfall(action.target.presetId);
    else if (action.target.type === 'company')
      setCompanyProvider(action.target.provider);
    else openResearchBuilder(action.target.provider);
  }
  const [httpBuilderOpen, setHttpBuilderOpen] = useState(false);
  const [formulaBuilderOpen, setFormulaBuilderOpen] = useState(false);
  const [formulaColumnQuery, setFormulaColumnQuery] = useState('');
  const [waterfallBuilderOpen, setWaterfallBuilderOpen] = useState(false);
  const [recipeSettingsOpen, setRecipeSettingsOpen] = useState(false);
  const [researchBuilderOpen, setResearchBuilderOpen] = useState(false);
  const [companyListOpen, setCompanyListOpen] = useState(false);
  const [peopleListOpen, setPeopleListOpen] = useState(false);
  const [savedViewOpen, setSavedViewOpen] = useState(false);
  const [columnEditorOpen, setColumnEditorOpen] = useState(false);
  const [templateSaveOpen, setTemplateSaveOpen] = useState(false);
  const [templateUseOpen, setTemplateUseOpen] = useState(false);
  const [researchConfirmOpen, setResearchConfirmOpen] = useState(false);
  const [backgroundRunsOpen, setBackgroundRunsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptPage, setReceiptPage] = useState(0);
  const [receiptQuery, setReceiptQuery] = useState('');
  const [receiptStatus, setReceiptStatus] = useState('all');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [workspaceVersions, setWorkspaceVersions] = useState<
    WorkspaceVersionSummary[]
  >([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState('');
  const [restoringVersionId, setRestoringVersionId] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffProvider, setHandoffProvider] =
    useState<CrmProvider>('hubspot');
  const [handoffMappingByColumn, setHandoffMappingByColumn] = useState<
    Record<string, ControlTowerContactField | ''>
  >({});
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState('');
  const [formulaColumnName, setFormulaColumnName] = useState('Personal label');
  const [formulaExpression, setFormulaExpression] = useState(
    '{{person | first}} at {{company}}',
  );
  const [waterfallColumnName, setWaterfallColumnName] = useState(
    'Best available value',
  );
  const [waterfallSteps, setWaterfallSteps] = useState<WaterfallStepDraft[]>(
    [],
  );
  const [templateColumnId, setTemplateColumnId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState('');
  const [templateResearchFocus, setTemplateResearchFocus] = useState('');
  const [templateResearchPrompt, setTemplateResearchPrompt] = useState('');
  const [templateResearchProvider, setTemplateResearchProvider] =
    useState<PomadeColumn['researchProvider']>();
  const [templateError, setTemplateError] = useState('');
  const [recipeFileMessage, setRecipeFileMessage] = useState('');
  const [templateBindings, setTemplateBindings] = useState<
    Record<string, string>
  >({});

  const [apolloOpen, setApolloOpen] = useState(false);
  const [apolloRunning, setApolloRunning] = useState(false);
  const [apolloError, setApolloError] = useState('');
  const [apolloResult, setApolloResult] = useState<ApolloEnrichmentResult>();
  const [apolloBatchSummary, setApolloBatchSummary] =
    useState<ApolloBatchSummary>();
  const [apolloStatus, setApolloStatus] = useState<ApolloProviderStatus>();
  const [researchStatusRevision, setResearchStatusRevision] = useState(0);
  const [researchCheck, setResearchCheck] = useState<{
    revision: number;
    status?: ResearchProviderStatus;
  }>({ revision: -1 });
  const researchStatus = researchCheck.status;
  const [columnEditorProvider, setColumnEditorProvider] =
    useState<PomadeColumn['researchProvider']>();
  const codexSettings = useCodexResearchSettings(
    ((columnEditorOpen && columnEditorProvider === 'codex') ||
      Boolean(
        researchStatus?.alternatives?.find((p) => p.provider === 'codex')
          ?.configured ?? researchStatus?.provider === 'codex',
      )) &&
      (researchBuilderOpen ||
        recipeSettingsOpen ||
        sourcesOpen ||
        columnEditorOpen),
  );
  const [researchModelSettings, setResearchModelSettings] =
    useState<CodexResearchSettings>();
  const researchStatusLoading =
    researchCheck.revision !== researchStatusRevision;
  const [researchColumnName, setResearchColumnName] = useState(
    'Recent company trigger',
  );
  const [researchPrompt, setResearchPrompt] = useState(DEFAULT_RESEARCH_PROMPT);
  const [researchOutputMode, setResearchOutputMode] =
    useState<ResearchOutputMode>('single');
  const [researchFields, setResearchFields] = useState<ResearchFieldDraft[]>(
    defaultResearchFields,
  );
  const [researchListLimit, setResearchListLimit] = useState(10);
  const [icpBrief, setIcpBrief] = useState(
    'B2B software companies with lean go-to-market teams that sell to revenue operations leaders in the United States.',
  );
  const [icpListLimit, setIcpListLimit] = useState(15);
  const [peopleBrief, setPeopleBrief] = useState(
    'Founders and revenue, sales operations, or go-to-market leaders',
  );
  const [peopleListLimit, setPeopleListLimit] = useState(10);
  const [savedViewName, setSavedViewName] = useState('Priority targets');
  const [savedViewColumnId, setSavedViewColumnId] = useState('status');
  const [savedViewOperator, setSavedViewOperator] =
    useState<RunConditionOperator>('equals');
  const [savedViewValue, setSavedViewValue] = useState('Ready');
  const [savedViewError, setSavedViewError] = useState('');
  const [columnEditorId, setColumnEditorId] = useState('');
  const [columnEditorTitle, setColumnEditorTitle] = useState('');
  const [columnEditorError, setColumnEditorError] = useState('');
  const [columnEditorPrompt, setColumnEditorPrompt] = useState('');
  const [columnEditorStepOrder, setColumnEditorStepOrder] = useState<number[]>(
    [],
  );
  const [columnEditorContinueOnError, setColumnEditorContinueOnError] =
    useState(false);
  const [columnEditorModel, setColumnEditorModel] =
    useState<CodexResearchSettings>();
  const [pendingRunRowIds, setPendingRunRowIds] = useState<string[]>([]);
  const [pendingRunColumnIds, setPendingRunColumnIds] = useState<string[]>([]);
  const [pendingRunMode, setPendingRunMode] =
    useState<PendingRunMode>('immediate');
  const [workbookRunning, setWorkbookRunning] = useState(false);
  const [runJobs, setRunJobs] = useState<RunJob[]>([]);
  const [jobSaving, setJobSaving] = useState(false);
  const [jobError, setJobError] = useState('');
  const [scheduleCadence, setScheduleCadence] =
    useState<RecipeScheduleCadence>('once');
  const [scheduleRunAt, setScheduleRunAt] = useState(defaultScheduleTime);
  const [scheduleTarget, setScheduleTarget] = useState<'all' | 'selected'>(
    'all',
  );
  const [scheduleRowIds, setScheduleRowIds] = useState<string[]>([]);
  const [scheduleConfirmsResearch, setScheduleConfirmsResearch] =
    useState(false);
  const [scheduleSourceEnabled, setScheduleSourceEnabled] = useState(false);
  const [scheduleSourceConfirmed, setScheduleSourceConfirmed] = useState(false);
  const [scheduleFunctionId, setScheduleFunctionId] = useState('');
  const [scheduleCrmIds, setScheduleCrmIds] = useState<string[]>([]);
  const [scheduleCrmConfirmed, setScheduleCrmConfirmed] = useState(false);
  const [scheduleCrmCondition, setScheduleCrmCondition] =
    useState<import('@/lib/pomade-types').RecipeRunCondition>();
  const [scheduleTransferIds, setScheduleTransferIds] = useState<string[]>([]);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleNow, setScheduleNow] = useState(() => Date.now());

  const [crmCatalog, setCrmCatalog] =
    useState<CrmCatalogStatus>(emptyCrmCatalog);
  const [sourceFields, setSourceFields] = useState({
    hubspot: '',
    salesforce: '',
  });
  const [sourceObjects, setSourceObjects] = useState({
    hubspot: 'contact',
    salesforce: 'lead',
  });
  const [hubSpotSegmentId, setHubSpotSegmentId] = useState('');
  const [sourceLoading, setSourceLoading] = useState<CrmProvider>();
  const [sourceError, setSourceError] = useState('');
  const [sourcePreview, setSourcePreview] = useState<CrmSourcePreview>();
  const sourceRequest = useRef<AbortController | undefined>(undefined);
  const savedSource = useMemo(() => savedCrmSource(workspace), [workspace]);
  const importReview = useMemo(
    () =>
      sourcePreview ? reviewCrmImport(workspace, sourcePreview) : undefined,
    [workspace, sourcePreview],
  );
  useEffect(() => () => sourceRequest.current?.abort(), []);

  const hydrated = useRef(false);
  const [savedWorkspace, setSavedWorkspace] = useState<WorkspaceSnapshot>();
  const [loaded, setLoaded] = useState(false);
  const latestLocal = useRef(workspace);
  useEffect(() => {
    latestLocal.current = workspace;
  }, [workspace]);
  const lastSaved = useRef<WorkspaceSnapshot | undefined>(undefined);
  useEffect(() => {
    lastSaved.current = savedWorkspace;
  }, [savedWorkspace]);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const jobRevision = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File>();
  const recipeFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(workspaceUrl)
      .then((response) => {
        if (!response.ok) throw new Error('Workspace failed to load');
        return response.json() as Promise<{ workspace: WorkspaceSnapshot }>;
      })
      .then((workspaceResponse) => {
        if (cancelled) return;
        setSidebarOpen(window.innerWidth >= 1000);
        try {
          setCompactRows(
            localStorage.getItem('pomade:compact-rows') === 'true',
          );
        } catch {
          /* Device preferences are optional. */
        }
        setSavedWorkspace(workspaceResponse.workspace);
        setLoaded(true);
        setWorkspace(workspaceResponse.workspace);
        const focused = workspaceResponse.workspace.rows.find(
          (row) => row.id === initialRowId,
        );
        setActiveRowId(
          focused?.id ?? workspaceResponse.workspace.rows[0]?.id ?? '',
        );
        if (focused) {
          setQuery('');
          setFilter('All');
          setActiveSavedViewId('');
          setSelectedRowIds([]);
          setInspectorOpen(true);
          setRowJump((current) => ({
            id: focused.id,
            revision: (current?.revision ?? 0) + 1,
          }));
        } else if (initialRowId) {
          setRowJump(undefined);
          setNotice('The linked source row no longer exists.');
        }
        setSaveState('Saved');
        hydrated.current = true;
      })
      .catch(() => {
        if (!cancelled) {
          setSaveState('Offline');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceUrl, workspaceId, initialRowId]);

  // History is optional; an outage must not block a healthy saved sheet.
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/runs?workspaceId=${encodeURIComponent(workspaceId)}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            'Run history is unavailable. Your sheet is still usable.',
          );
        const data = (await response.json()) as { runs: RunReceipt[] };
        if (controller.signal.aborted) return;
        setHistoryError('');
        setRunHistory((current) =>
          [
            ...new Map(
              [...current, ...data.runs].map((run) => [run.id, run]),
            ).values(),
          ]
            .sort((a, b) => b.finishedAt - a.finishedAt)
            .slice(0, 10),
        );
        setLatestRun((current) =>
          current && current.finishedAt > (data.runs[0]?.finishedAt ?? 0)
            ? current
            : data.runs[0],
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setHistoryError(
            error instanceof Error
              ? error.message
              : 'Run history is unavailable.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, historyRevision]);

  // Provider readiness must not hold up loading or editing the saved table.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/providers/apollo')
      .then((response) => {
        if (!response.ok) throw new Error('Apollo status failed to load');
        return response.json() as Promise<ApolloProviderStatus>;
      })
      .then((status) => {
        if (!cancelled) setApolloStatus(status);
      })
      .catch(() => {
        if (!cancelled)
          setApolloStatus({
            configured: false,
            capabilities: {
              personMatch: true,
              verifiedWorkEmail: true,
              phoneReveal: false,
            },
          });
      });
    void fetch('/api/providers/crm')
      .then((response) => {
        if (!response.ok) throw new Error('CRM status failed to load');
        return response.json() as Promise<CrmCatalogStatus>;
      })
      .then((status) => {
        if (!cancelled) setCrmCatalog(status);
      })
      .catch(() => {
        if (!cancelled) setCrmCatalog(emptyCrmCatalog);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/providers/research', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
    })
      .then((response) => {
        if (!response.ok) throw new Error('Research status failed to load');
        return response.json() as Promise<ResearchProviderStatus>;
      })
      .then((status) => {
        if (!controller.signal.aborted)
          setResearchCheck({ revision: researchStatusRevision, status });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResearchCheck({
            revision: researchStatusRevision,
            status: {
              provider: null,
              configured: false,
              label: 'AI web research',
              model: 'Connection unavailable',
              error:
                'Could not check the research connection. Make sure Pomade is running, then check again.',
              capabilities: {
                webResearch: true,
                citations: true,
                maximumActionsPerRun: 10,
              },
            },
          });
      });
    return () => controller.abort();
  }, [researchStatusRevision]);

  useEffect(() => {
    let cancelled = false;
    async function pollJobs() {
      try {
        const response = await fetch(
          `/api/jobs?workspaceId=${encodeURIComponent(workspaceId)}`,
        );
        if (!response.ok) return;
        const result = (await response.json()) as { jobs: RunJob[] };
        if (cancelled) return;
        const newestRevision = Math.max(
          0,
          ...result.jobs.map((job) => job.updatedAt),
        );
        const changed =
          jobRevision.current > 0 && newestRevision > jobRevision.current;
        jobRevision.current = newestRevision;
        setRunJobs(result.jobs);
        if (changed && hydrated.current && lastSaved.current) {
          const response = await fetch(workspaceUrl);
          if (cancelled || !response.ok) return;
          const data = (await response.json()) as {
            workspace: WorkspaceSnapshot;
          };
          if (cancelled) return;
          try {
            const next = reconcileWorkspaceUpdate(
              lastSaved.current,
              latestLocal.current,
              data.workspace,
            );
            lastSaved.current = next.saved;
            latestLocal.current = next.workspace;
            setSavedWorkspace(next.saved);
            setWorkspace(next.workspace);
            setSaveState(next.workspace === next.saved ? 'Saved' : 'Saving');
          } catch (error) {
            setSaveState('Offline');
            setNotice(
              error instanceof Error
                ? error.message
                : 'Keep this tab open to preserve unsaved edits.',
            );
          }
          setHistoryLoading(true);
          setHistoryRevision((value) => value + 1);
        }
      } catch {
        // Background polling is best-effort; the workspace remains usable.
      }
    }
    void pollJobs();
    const timer = window.setInterval(pollJobs, 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [workspaceId, workspaceUrl]);

  useEffect(() => {
    if (!hydrated.current || running || apolloRunning || jobSaving) return;
    if (savedWorkspace === workspace) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSaveState('Saving');
      // Serialize saves so an older request cannot finish over a newer edit.
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(async () => {
          if (cancelled) return;
          const response = await fetch(workspaceUrl, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workspace,
              baseWorkspace: lastSaved.current,
            }),
          });
          const data = (await response.json()) as {
            workspace?: WorkspaceSnapshot;
            error?: string;
          };
          if (!response.ok || !data.workspace)
            throw new Error(data.error ?? 'Save failed');
          const stored = data.workspace;
          const merged =
            latestLocal.current === workspace
              ? stored
              : mergeWorkspaceEdits(workspace, latestLocal.current, stored);
          lastSaved.current = stored;
          setSavedWorkspace(stored);
          setWorkspace(merged);
          setSaveState('Saved');
        })
        .catch((error) => {
          setSaveState('Offline');
          setNotice(
            error instanceof Error
              ? error.message
              : 'Save failed; edits remain in this tab.',
          );
        });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    workspace,
    workspaceUrl,
    savedWorkspace,
    running,
    apolloRunning,
    jobSaving,
    saveAttempt,
  ]);

  useEffect(() => {
    if (
      !loaded ||
      savedWorkspace !== workspace ||
      running ||
      apolloRunning ||
      jobSaving
    )
      return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(workspaceUrl);
        if (!response.ok) return;
        const data = (await response.json()) as {
          workspace: WorkspaceSnapshot;
        };
        if (
          cancelled ||
          (data.workspace.revision ?? 0) === (workspace.revision ?? 0)
        )
          return;
        lastSaved.current = data.workspace;
        setSavedWorkspace(data.workspace);
        setWorkspace(data.workspace);
      } catch {
        /* Keep the last usable snapshot when offline. */
      }
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    loaded,
    savedWorkspace,
    workspace,
    running,
    apolloRunning,
    jobSaving,
    workspaceUrl,
  ]);

  const canLeaveTable =
    saveState === 'Saved' &&
    savedWorkspace === workspace &&
    !running &&
    !apolloRunning &&
    !jobSaving &&
    !restoringVersionId;
  useEffect(() => {
    if (hydrated.current)
      onTableState(summarizeTable(workspace), canLeaveTable);
  }, [workspace, canLeaveTable, onTableState]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 8_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const activeSavedView = (workspace.savedViews ?? []).find(
    (view) => view.id === activeSavedViewId,
  );
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspace.rows.filter((row) => {
      const matchesStatus = filter === 'All' || row.values.status === filter;
      const matchesSaved =
        !activeSavedView || rowMatchesSavedView(row, activeSavedView);
      const matchesQuery =
        !needle ||
        Object.values(row.values).some((value) =>
          value.toLowerCase().includes(needle),
        );
      return matchesStatus && matchesSaved && matchesQuery;
    });
  }, [activeSavedView, filter, query, workspace.rows]);

  const { selectedIds: selectedRowIds, active: selected } = useMemo(
    () => visibleSelection(visibleRows, selectedRowStateIds, activeRowId),
    [visibleRows, selectedRowStateIds, activeRowId],
  );
  const selectedValues = selected?.values ?? {};
  const editedColumn = workspace.columns.find(
    (column) => column.id === columnEditorId,
  );
  const researchEditorSettings = {
    title: columnEditorTitle,
    prompt: columnEditorPrompt,
    researchProvider: columnEditorProvider,
    codexResearch: columnEditorModel,
  };
  const researchEditorDirty =
    editedColumn?.recipe === 'web-research' &&
    researchSettingsChanged(editedColumn, researchEditorSettings);
  const waterfallEditorDirty = Boolean(
    editedColumn?.providerWaterfall &&
    (columnEditorStepOrder.some((index, position) => index !== position) ||
      columnEditorContinueOnError !==
        editedColumn.providerWaterfall.continueOnError),
  );
  const recipeEditorDirty = researchEditorDirty || waterfallEditorDirty;
  const waterfallWaitingJob = editedColumn?.providerWaterfall
    ? runJobs.find(
        (job) =>
          ['paused', 'failed'].includes(job.status) &&
          (!job.columnIds?.length || job.columnIds.includes(editedColumn.id)),
      )
    : undefined;
  const editedColumnDependencies = editedColumn
    ? findColumnDependencies(workspace, editedColumn.id)
    : [];
  const apolloTargetRows = selectedRowIds.length
    ? workspace.rows.filter((row) => selectedRowIds.includes(row.id))
    : selected
      ? [selected]
      : [];
  const apolloEligibleRows = apolloTargetRows.filter(
    (row) => row.values.person?.trim() && row.values.domain?.trim(),
  );
  const apolloTargetValues = apolloTargetRows[0]?.values ?? {};
  const readyCount = workspace.rows.filter(
    (row) => row.values.status === 'Ready',
  ).length;
  const reviewCount = workspace.rows.filter(
    (row) => row.values.status === 'Review',
  ).length;
  const recipeColumns = workspace.columns.filter(
    (column) => column.kind === 'formula' || column.kind === 'enrichment',
  );
  const recipeTemplates = workspace.recipeTemplates ?? [];
  const templateColumn = workspace.columns.find(
    (column) => column.id === templateColumnId,
  );
  const activeTemplate = [
    PERSONAL_OPENER_RECIPE,
    ...RESEARCH_RECIPES,
    ...recipeTemplates,
  ].find((template) => template.id === activeTemplateId);
  const templateBindingsReady = Boolean(
    activeTemplate?.inputs.every(
      (input) => !input.required || templateBindings[input.key],
    ),
  );
  const recipeCount = recipeColumns.length;
  const conditionCount = recipeColumns.filter(
    (column) => column.runCondition,
  ).length;
  const automaticFormulaCount = recipeColumns.filter(
    (column) => column.kind === 'formula' && column.autoRun,
  ).length;
  const formulaInputColumns = workspace.columns.filter(
    (column) =>
      column.kind !== 'status' &&
      `${column.title} ${column.id}`
        .toLowerCase()
        .includes(formulaColumnQuery.trim().toLowerCase()),
  );
  const singleColumnLimit = columnCapacityError(workspace);
  const waterfallColumnLimit = columnCapacityError(workspace, 2);
  const researchColumnLimit = columnCapacityError(
    workspace,
    researchOutputMode === 'single'
      ? 1
      : researchFields.filter((field) => field.title.trim()).length,
  );
  const researchOutputReady =
    researchOutputMode === 'single'
      ? Boolean(researchColumnName.trim())
      : researchFields.length >= (researchOutputMode === 'list' ? 1 : 2) &&
        researchFields.every((field) => field.title.trim());
  const waterfallReady =
    Boolean(waterfallColumnName.trim()) &&
    waterfallSteps.length >= 2 &&
    waterfallSteps.every((step) => step.field) &&
    new Set(waterfallSteps.map((step) => step.field)).size ===
      waterfallSteps.length;
  const webResearchColumns = useMemo(
    () => workspace.columns.filter(isExternalRecipe),
    [workspace.columns],
  );
  const pendingRecipeColumns = recipeColumns.filter((column) =>
    pendingRunColumnIds.includes(column.id),
  );
  const pendingWebResearchColumns =
    pendingRecipeColumns.filter(isExternalRecipe);
  const pendingRows = workspace.rows.filter((row) =>
    pendingRunRowIds.includes(row.id),
  );
  const pendingBudget = runBudget(pendingRows, pendingRecipeColumns);
  const pendingRequiresBackground = pendingRecipeColumns.some(
    (column) =>
      hasAsyncProvider(column) ||
      (deployment.hosted &&
        column.recipe === 'web-research' &&
        (column.researchProvider ?? researchStatus?.provider) === 'codex'),
  );
  const effectiveRunMode = pendingRequiresBackground
    ? 'background'
    : pendingRunMode;
  const pendingBudgetIssue =
    effectiveRunMode === 'background'
      ? pendingBudget.backgroundIssue
      : pendingBudget.immediateIssue;
  const connectedCount = [
    apolloStatus?.configured,
    researchStatus?.configured,
    crmCatalog.providers.hubspot.configured,
    crmCatalog.providers.salesforce.configured,
  ].filter(Boolean).length;
  const pendingResearchActionCount = pendingBudget.total;
  const pendingListRowLimit = useMemo(() => {
    const pending = new Set(pendingRunRowIds);
    const pendingRows = workspace.rows.filter((row) => pending.has(row.id));
    return pendingWebResearchColumns
      .filter((column) => column.outputCardinality === 'list')
      .reduce(
        (total, column) =>
          total +
          countMaximumExternalActions(pendingRows, [column]) *
            Math.min(25, Math.max(1, column.listLimit ?? 10)),
        0,
      );
  }, [pendingRunRowIds, pendingWebResearchColumns, workspace.rows]);
  const latestRunJob = runJobs[0];
  const currentRunJob =
    latestRunJob &&
    ['queued', 'running', 'paused', 'failed'].includes(latestRunJob.status)
      ? latestRunJob
      : undefined;
  const jobLocksWorkspace = Boolean(
    workbookRunning ||
    workspace.schedule?.state === 'running' ||
    running ||
    apolloRunning ||
    jobSaving ||
    restoringVersionId ||
    runJobLocksWorkspace(currentRunJob),
  );
  const scheduledTargetRows =
    scheduleTarget === 'selected'
      ? workspace.rows.filter((row) => scheduleRowIds.includes(row.id))
      : workspace.rows;
  const scheduleFunctions = [
    ...new Map(
      workspace.columns
        .filter((c) => c.functionInstance)
        .map((c) => [c.functionInstance!.id, c.functionInstance!]),
    ).values(),
  ];
  let scheduleColumnIds: string[] | undefined;
  let scheduleScopeError = '';
  try {
    if (scheduleFunctionId)
      scheduleColumnIds = functionStepIds(
        workspace.columns,
        scheduleFunctionId,
      );
  } catch (error) {
    scheduleScopeError =
      error instanceof Error ? error.message : 'Function is unavailable.';
  }
  const scheduledExternalColumns = scheduleColumnIds
    ? webResearchColumns.filter((c) => scheduleColumnIds.includes(c.id))
    : webResearchColumns;

  if (
    scheduledTargetRows.length +
      (scheduleSourceEnabled
        ? (workspace.apiSourceRefresh?.config.maxRows ?? 0)
        : 0) >
    100
  )
    scheduleScopeError =
      'Limit a scheduled run to 100 rows, including possible source additions.';
  if (
    scheduledTargetRows.some(
      (row) =>
        countMaximumExternalActions([row], scheduledExternalColumns) > 10,
    )
  )
    scheduleScopeError =
      'Limit each scheduled row to 10 provider submissions, including verifications.';
  const scheduledResearchActionCount = countMaximumExternalActions(
    scheduleSourceEnabled && workspace.apiSourceRefresh
      ? [
          ...scheduledTargetRows,
          ...Array.from(
            { length: workspace.apiSourceRefresh.config.maxRows },
            (_, i) => ({ id: `future_${i}`, values: {} }),
          ),
        ]
      : scheduledTargetRows,
    scheduledExternalColumns,
  );
  const savedScheduleJob = runJobs.find(
    (job) => job.id === workspace.schedule?.jobId,
  );
  const scheduleHasUnfinishedRun =
    workspace.schedule?.state === 'running' ||
    Boolean(
      savedScheduleJob &&
      savedScheduleJob.status !== 'cancelled' &&
      ['failed', 'paused'].includes(workspace.schedule?.state ?? ''),
    );
  const scheduleTimestamp = new Date(scheduleRunAt).getTime();
  const scheduleReady =
    !scheduleScopeError &&
    !scheduleHasUnfinishedRun &&
    (!scheduleCrmIds.length || scheduleCrmConfirmed) &&
    (!scheduleSourceEnabled ||
      (Boolean(workspace.apiSourceRefresh) && scheduleSourceConfirmed)) &&
    recipeCount > 0 &&
    Number.isFinite(scheduleTimestamp) &&
    scheduleTimestamp > scheduleNow &&
    (scheduledTargetRows.length > 0 || scheduleSourceEnabled) &&
    scheduledResearchActionCount <= MAX_BACKGROUND_RESEARCH_ACTIONS &&
    (scheduledExternalColumns.length === 0 || scheduleConfirmsResearch);
  const icpListReady = Boolean(icpBrief.trim()) && icpListLimit >= 1;
  const peopleListReady = Boolean(
    selected &&
    (selected.values.company?.trim() || selected.values.domain?.trim()) &&
    peopleBrief.trim() &&
    peopleListLimit >= 1,
  );
  const savedViewReady = Boolean(
    savedViewName.trim() &&
    savedViewColumnId &&
    (!conditionNeedsValue(savedViewOperator) || savedViewValue.trim()),
  );
  const selectedReceipts = runHistory
    .flatMap((run) => run.receipts)
    .filter((receipt) => receipt.rowId === selected?.id)
    .slice(0, 6);
  const recentUsage = summarizeRecentUsage(runHistory);
  const runTargetIds = selectedRowIds.length
    ? selectedRowIds
    : visibleRows.map((row) => row.id);
  const currentReceipt = receiptRun ?? latestRun;
  const filteredReceipts = useMemo(() => {
    const terms = receiptQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return (currentReceipt?.receipts ?? []).filter((receipt) => {
      if (receiptStatus !== 'all' && receipt.status !== receiptStatus)
        return false;
      const text = [
        receipt.rowLabel,
        receipt.action,
        receipt.after,
        receipt.error,
        ...(receipt.attempts ?? []).flatMap((attempt) => [
          attempt.action,
          attempt.error,
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [currentReceipt, receiptQuery, receiptStatus]);
  const handoffRowIds = selectedRowIds.length
    ? selectedRowIds
    : selected
      ? [selected.id]
      : [];
  const handoffColumns = workspace.columns.filter(
    (column) => column.kind !== 'status' && !column.id.startsWith('__'),
  );
  const handoffMappings: ControlTowerFieldMapping[] = handoffColumns.flatMap(
    (column) => {
      const contactField = handoffMappingByColumn[column.id];
      if (!contactField || column.kind === 'status') return [];
      return [
        {
          sourceColumnId: column.id,
          sourceColumnTitle: column.title,
          contactField,
          destinationFields: [],
        },
      ];
    },
  );
  const handoffPlan = toControlTowerPreview(workspace, handoffRowIds, {
    provider: handoffProvider,
    mappings: handoffMappings,
  });
  const mappedHandoffFields = new Set(
    handoffPlan.fieldMappings.map((mapping) => mapping.contactField),
  );
  const handoffRequirements = [
    !mappedHandoffFields.has('email') ? 'work email' : '',
    !mappedHandoffFields.has('fullName') && !mappedHandoffFields.has('lastName')
      ? 'full or last name'
      : '',
    handoffProvider === 'salesforce' && !mappedHandoffFields.has('company')
      ? 'company'
      : '',
  ].filter(Boolean);

  const updateVisibleRows = useCallback(
    (changedRows: PomadeRow[], editedColumnId?: string) => {
      setWorkspace((current) =>
        applyGridEdits(current, changedRows, editedColumnId),
      );
    },
    [],
  );

  const updateSelectedRows = useCallback((rowIds: string[]) => {
    setSelectedRowIds(rowIds);
  }, []);

  function resizeColumn(columnId: string, width: number) {
    setWorkspace((current) => resizeWorkspaceColumn(current, columnId, width));
  }

  function reorderColumns(startIndex: number, endIndex: number) {
    try {
      setWorkspace(moveVisibleWorkspaceColumn(workspace, startIndex, endIndex));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'That column cannot move.',
      );
    }
  }

  function openColumnEditor(columnId: string) {
    const column = workspace.columns.find(
      (candidate) => candidate.id === columnId,
    );
    if (!column) return;
    setColumnEditorId(column.id);
    setColumnEditorTitle(column.title);
    setColumnEditorPrompt(column.prompt ?? '');
    setColumnEditorStepOrder(
      column.providerWaterfall?.steps.map((_, index) => index) ?? [],
    );
    setColumnEditorContinueOnError(
      column.providerWaterfall?.continueOnError ?? false,
    );
    setColumnEditorProvider(column.researchProvider);
    setColumnEditorModel(
      column.codexResearch ? { ...column.codexResearch } : undefined,
    );
    setColumnEditorError('');
    setColumnEditorOpen(true);
  }

  function renameColumn() {
    if (
      !editedColumn ||
      jobLocksWorkspace ||
      (waterfallEditorDirty && waterfallWaitingJob)
    )
      return;
    try {
      const next =
        editedColumn.recipe === 'web-research'
          ? updateResearchColumnSettings(
              workspace,
              columnEditorId,
              researchEditorSettings,
            )
          : editedColumn.providerWaterfall
            ? updateWaterfallColumnOrder(workspace, columnEditorId, {
                title: columnEditorTitle,
                stepOrder: columnEditorStepOrder,
                continueOnError: columnEditorContinueOnError,
              })
            : renameWorkspaceColumn(
                workspace,
                columnEditorId,
                columnEditorTitle,
              );
      setWorkspace(next);
      setColumnEditorOpen(false);
      setNotice(
        recipeEditorDirty
          ? `Recipe settings saved. Existing results stay until you rerun.${workspace.schedule?.enabled && !next.schedule?.enabled ? ' Review and resume the paused schedule when ready.' : ''}`
          : 'Column settings saved.',
      );
    } catch (error) {
      setColumnEditorError(
        error instanceof Error
          ? error.message
          : 'The settings could not be saved.',
      );
    }
  }

  function deleteColumn() {
    if (!editedColumn || jobLocksWorkspace) return;
    if (editedColumnDependencies.length) {
      setColumnEditorError(
        'Remove the listed dependencies before deleting this column.',
      );
      return;
    }
    if (
      !window.confirm(
        `Delete “${editedColumn.title}” and its values from every row? Version history can restore it.`,
      )
    )
      return;
    try {
      const hadActiveSchedule = workspace.schedule?.enabled === true;
      const updated = deleteWorkspaceColumn(workspace, editedColumn.id);
      setWorkspace(updated);
      setColumnEditorOpen(false);
      setColumnEditorId('');
      setNotice(
        hadActiveSchedule && updated.schedule?.state === 'paused'
          ? 'Column deleted. The schedule was paused because no recipes remain.'
          : 'Column and its row values deleted. Version history can restore them.',
      );
    } catch (error) {
      setColumnEditorError(
        error instanceof Error
          ? error.message
          : 'The column could not be deleted.',
      );
    }
  }

  function runEditedColumn(mode: PendingRunMode) {
    if (recipeEditorDirty || jobLocksWorkspace) return;
    if (
      !editedColumn ||
      (editedColumn.kind !== 'formula' && editedColumn.kind !== 'enrichment')
    )
      return;
    setColumnEditorOpen(false);
    if (mode === 'background') {
      void queueBackgroundRun(runTargetIds, false, [editedColumn.id]);
    } else {
      void runEnrichment(runTargetIds, false, [editedColumn.id]);
    }
  }

  function openColumnPicker() {
    setRecipeQuery('');
    setAddColumnOpen(true);
  }

  function addDataColumn() {
    if (jobLocksWorkspace) return;
    try {
      const id = uniqueId(
        slugify(dataColumnName) || 'field',
        new Set(workspace.columns.map((column) => column.id)),
      );
      setWorkspace(
        addWorkspaceDataColumn(workspace, {
          id,
          title: dataColumnName,
          valueType: dataColumnType,
        }),
      );
      setDataColumnOpen(false);
      setNotice(
        `${dataColumnName.trim()} added. Start typing or paste values into your new column.`,
      );
    } catch (error) {
      setDataColumnError(
        error instanceof Error
          ? error.message
          : 'The column could not be added.',
      );
    }
  }

  function addRecipeColumn(preset: RecipePreset) {
    if (singleColumnLimit || jobLocksWorkspace) return;
    const used = new Set(workspace.columns.map((column) => column.id));
    const id = uniqueId(slugify(preset.title), used);
    const {
      group: _group,
      description: _description,
      requires: _requires,
      ...column
    } = preset;
    const nextColumn = { id, ...column };
    const pausesSchedule =
      preset.recipe === 'web-research' && Boolean(workspace.schedule?.enabled);
    setWorkspace((current) => {
      const columns = [
        ...current.columns.filter((item) => item.kind !== 'status'),
        nextColumn,
        ...current.columns.filter((item) => item.kind === 'status'),
      ];
      const rows = current.rows.map((row) =>
        recalculateAutomaticFormulas(
          { ...row, values: { ...row.values, [id]: '' } },
          columns,
        ),
      );
      return {
        ...current,
        columns,
        rows,
        schedule:
          preset.recipe === 'web-research' && current.schedule?.enabled
            ? pauseRecipeSchedule(current.schedule)
            : current.schedule,
        updatedAt: Date.now(),
      };
    });
    setAddColumnOpen(false);
    setNotice(
      preset.kind === 'formula' && preset.autoRun
        ? `${preset.title} is live and will update with its inputs.`
        : `${preset.title} is ready to run${pausesSchedule ? ' · schedule paused for new provider scope' : ''}.`,
    );
  }

  function updateRecipeColumn(
    columnId: string,
    patch: Partial<
      Pick<
        PomadeColumn,
        'autoRun' | 'runCondition' | 'codexResearch' | 'researchProvider'
      >
    >,
  ) {
    setWorkspace((current) => {
      const columns = current.columns.map((column) =>
        column.id === columnId ? { ...column, ...patch } : column,
      );
      return {
        ...current,
        columns,
        rows: current.rows.map((row) =>
          recalculateAutomaticFormulas(row, columns),
        ),
        updatedAt: Date.now(),
      };
    });
  }

  function openTemplateSave(column: PomadeColumn) {
    setRecipeSettingsOpen(false);
    setTemplateColumnId(column.id);
    setTemplateName(column.title);
    setTemplateDescription('');
    setTemplateError('');
    setTemplateSaveOpen(true);
  }

  function saveRecipeTemplate() {
    if (!templateColumn || !templateName.trim()) return;
    try {
      const template = createRecipeTemplate(templateColumn, workspace.columns, {
        id: crypto.randomUUID(),
        name: templateName,
        description: templateDescription,
      });
      setWorkspace((current) => ({
        ...current,
        recipeTemplates: [...(current.recipeTemplates ?? []), template],
        updatedAt: Date.now(),
      }));
      setTemplateSaveOpen(false);
      setNotice(`${template.name} saved to your recipe library.`);
    } catch (error) {
      setTemplateError(
        error instanceof Error ? error.message : 'Template could not be saved.',
      );
    }
  }

  function openTemplateUse(template: RecipeTemplate) {
    setAddColumnOpen(false);
    setActiveTemplateId(template.id);
    setTemplateResearchFocus('');
    setTemplateResearchPrompt(template.column.prompt ?? '');
    setTemplateResearchProvider(template.column.researchProvider);
    setTemplateBindings(defaultTemplateBindings(template, workspace.columns));
    setTemplateError('');
    setTemplateUseOpen(true);
  }

  function useRecipeTemplate() {
    if (!activeTemplate || !templateBindingsReady) return;
    try {
      const addedColumns = instantiateRecipeTemplate(
        prepareResearchRecipe(activeTemplate, {
          focus: templateResearchFocus,
          prompt:
            activeTemplate.id === PERSONAL_OPENER_RECIPE.id
              ? templateResearchPrompt
              : undefined,
          provider: templateResearchProvider,
        }),
        workspace.columns,
        templateBindings,
      );
      const pausesSchedule =
        isExternalRecipe(activeTemplate.column) &&
        Boolean(workspace.schedule?.enabled);
      setWorkspace((current) => {
        const columns = [
          ...current.columns.filter((column) => column.kind !== 'status'),
          ...addedColumns,
          ...current.columns.filter((column) => column.kind === 'status'),
        ];
        const rows = current.rows.map((row) =>
          recalculateAutomaticFormulas(
            {
              ...row,
              values: {
                ...row.values,
                ...Object.fromEntries(
                  addedColumns.map((column) => [column.id, '']),
                ),
              },
            },
            columns,
          ),
        );
        return {
          ...current,
          columns,
          rows,
          schedule:
            isExternalRecipe(activeTemplate.column) && current.schedule?.enabled
              ? pauseRecipeSchedule(current.schedule)
              : current.schedule,
          updatedAt: Date.now(),
        };
      });
      setTemplateUseOpen(false);
      setNotice(
        `${activeTemplate.name} added with ${addedColumns.length} output${addedColumns.length === 1 ? '' : 's'}${pausesSchedule ? ' · schedule paused for new provider scope' : ''}.`,
      );
    } catch (error) {
      setTemplateError(
        error instanceof Error ? error.message : 'Template could not be added.',
      );
    }
  }

  function downloadRecipe(template: RecipeTemplate) {
    try {
      const contents = exportRecipeFile(template);
      const url = URL.createObjectURL(
        new Blob([contents], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${slugify(template.name)}.pomade-recipe.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setRecipeFileMessage(
        `${template.name} exported. Review prompt text before sharing.`,
      );
    } catch (error) {
      setRecipeFileMessage(
        error instanceof Error ? error.message : 'Recipe export failed.',
      );
    }
  }

  async function loadRecipeFile(file: File) {
    if (jobLocksWorkspace) return;
    setRecipeFileMessage('');
    const revision = jobRevision.current;
    try {
      if (file.size > MAX_RECIPE_FILE_BYTES)
        throw new Error('Recipe files must be smaller than 256 KB.');
      const template = importRecipeFile(await file.text(), crypto.randomUUID());
      if (revision !== jobRevision.current)
        throw new Error(
          'Background work changed. Please import the recipe again when it finishes.',
        );
      setWorkspace((current) => ({
        ...current,
        recipeTemplates: [...(current.recipeTemplates ?? []), template],
        updatedAt: Date.now(),
      }));
      setRecipeFileMessage(
        `${template.name} imported into your recipe library. Map its inputs with Use.`,
      );
    } catch (error) {
      setRecipeFileMessage(
        error instanceof Error ? error.message : 'Recipe import failed.',
      );
    }
  }

  function deleteRecipeTemplate(template: RecipeTemplate) {
    if (!window.confirm(`Delete the saved template “${template.name}”?`))
      return;
    setWorkspace((current) => ({
      ...current,
      recipeTemplates: (current.recipeTemplates ?? []).filter(
        (candidate) => candidate.id !== template.id,
      ),
      updatedAt: Date.now(),
    }));
    setNotice(`${template.name} removed from your recipe library.`);
  }

  function openResearchBuilder(provider?: PomadeColumn['researchProvider']) {
    setResearchBuilderProvider(provider);
    setAddColumnOpen(false);
    setResearchColumnName('Recent company trigger');
    setResearchPrompt(DEFAULT_RESEARCH_PROMPT);
    setResearchOutputMode('single');
    setResearchFields(defaultResearchFields());
    setResearchListLimit(10);
    setResearchBuilderOpen(true);
  }

  function openCompanyListBuilder() {
    setIcpListLimit(15);
    setCompanyListOpen(true);
  }

  function openPeopleListBuilder() {
    if (
      !selected ||
      (!selected.values.company?.trim() && !selected.values.domain?.trim())
    ) {
      setNotice('Choose a row with a company or company domain first.');
      return;
    }
    setPeopleListLimit(10);
    setPeopleListOpen(true);
  }

  function createCompanyList() {
    if (!icpListReady) return;
    const result = createCompanyListWorkspace(workspace, {
      brief: icpBrief,
      limit: icpListLimit,
      sourceRowId: crypto.randomUUID(),
    });
    setWorkspace(result.workspace);
    setActiveRowId(result.sourceRowId);
    setSelectedRowIds([result.sourceRowId]);
    setFilter('All');
    setActiveSavedViewId('');
    setQuery('');
    setPendingRunRowIds([result.sourceRowId]);
    setPendingRunColumnIds([result.researchColumnId]);
    setPendingRunMode('immediate');
    setCompanyListOpen(false);
    setResearchConfirmOpen(true);
    if (result.schedulePaused) {
      setNotice('Schedule paused so you can approve the new research scope.');
    }
  }

  function createPeopleList() {
    if (!peopleListReady || !selected) return;
    const result = createPeopleListWorkspace(workspace, {
      rowId: selected.id,
      brief: peopleBrief,
      limit: peopleListLimit,
    });
    setWorkspace(result.workspace);
    setActiveRowId(result.sourceRowId);
    setSelectedRowIds([result.sourceRowId]);
    setFilter('All');
    setActiveSavedViewId('');
    setQuery('');
    setPendingRunRowIds([result.sourceRowId]);
    setPendingRunColumnIds([result.researchColumnId]);
    setPendingRunMode('immediate');
    setPeopleListOpen(false);
    setResearchConfirmOpen(true);
    if (result.schedulePaused) {
      setNotice('Schedule paused so you can approve the new research scope.');
    }
  }

  function chooseResearchOutputMode(mode: ResearchOutputMode) {
    const next = changeResearchDraftMode(
      {
        mode: researchOutputMode,
        prompt: researchPrompt,
        fields: researchFields,
      },
      mode,
      {
        prompt: DEFAULT_RESEARCH_PROMPT,
        listPrompt: DEFAULT_LIST_RESEARCH_PROMPT,
        fields: defaultResearchFields(),
        listFields: defaultListResearchFields(),
      },
    );
    setResearchPrompt(next.prompt);
    setResearchFields(next.fields);
    setResearchOutputMode(next.mode);
  }

  function openFormulaBuilder() {
    setAddColumnOpen(false);
    setFormulaColumnQuery('');
    setFormulaColumnName('Personal label');
    setFormulaExpression('{{person | first}} at {{company}}');
    setFormulaBuilderOpen(true);
  }

  function openWaterfallBuilder() {
    setAddColumnOpen(false);
    setWaterfallColumnName('Best available value');
    const available = workspace.columns.filter(
      (column) => column.kind !== 'status',
    );
    const preferred = ['email', 'apollo_email', 'phone', 'domain']
      .map((id) => available.find((column) => column.id === id))
      .filter((column): column is PomadeColumn => Boolean(column));
    const picked = [...preferred];
    for (const column of available) {
      if (picked.length >= 2) break;
      if (!picked.some((candidate) => candidate.id === column.id)) {
        picked.push(column);
      }
    }
    setWaterfallSteps(
      Array.from({ length: Math.max(2, picked.length) }, (_, index) => ({
        key: crypto.randomUUID(),
        field: picked[index]?.id ?? '',
      })),
    );
    setWaterfallBuilderOpen(true);
  }

  function moveWaterfallStep(index: number, offset: -1 | 1) {
    setWaterfallSteps((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addCustomFormulaColumn() {
    if (singleColumnLimit || jobLocksWorkspace) return;
    const title = formulaColumnName.trim();
    const expression = formulaExpression.trim();
    if (!title || !expression) return;
    addRecipeColumn({
      title,
      kind: 'formula',
      recipe: 'custom-formula',
      autoRun: true,
      expression,
      width: 280,
      group: 'Transform',
      description: 'A custom row-aware merge formula.',
      requires: 'Visible grid columns',
    });
    setFormulaBuilderOpen(false);
  }

  function addWaterfallColumn() {
    if (waterfallColumnLimit || jobLocksWorkspace) return;
    const title = waterfallColumnName.trim();
    if (!title || !waterfallReady) return;
    const used = new Set(workspace.columns.map((column) => column.id));
    const valueId = uniqueId(slugify(title), used);
    const sourceTitle = `${title} source`;
    const sourceId = uniqueId(slugify(sourceTitle), used);
    const configuredSteps: WaterfallStep[] = waterfallSteps.map((step) => ({
      field: step.field,
      label:
        workspace.columns.find((column) => column.id === step.field)?.title ??
        step.field,
    }));
    const waterfallColumn: PomadeColumn = {
      id: valueId,
      title,
      kind: 'formula',
      recipe: 'waterfall',
      autoRun: true,
      width: 240,
      lineageColumnId: sourceId,
      outputFields: [
        { id: valueId, title, valueType: 'text' },
        { id: sourceId, title: sourceTitle, valueType: 'text' },
      ],
      waterfallSteps: configuredSteps,
    };
    const sourceColumn: PomadeColumn = {
      id: sourceId,
      title: sourceTitle,
      kind: 'text',
      valueType: 'text',
      width: 180,
    };
    setWorkspace((current) => {
      const columns = [
        ...current.columns.filter((column) => column.kind !== 'status'),
        waterfallColumn,
        sourceColumn,
        ...current.columns.filter((column) => column.kind === 'status'),
      ];
      const rows = current.rows.map((row) =>
        recalculateAutomaticFormulas(
          {
            ...row,
            values: {
              ...row.values,
              [valueId]: '',
              [sourceId]: '',
            },
          },
          columns,
        ),
      );
      return { ...current, columns, rows, updatedAt: Date.now() };
    });
    setWaterfallBuilderOpen(false);
    setNotice(
      `${title} now uses ${configuredSteps.length} fallbacks with source lineage.`,
    );
  }

  function addWebResearchColumn() {
    if (researchColumnLimit || jobLocksWorkspace) return;
    const prompt = researchPrompt.trim();
    if (!prompt) return;
    if (researchOutputMode === 'single') {
      const title = researchColumnName.trim();
      if (!title) return;
      addRecipeColumn({
        title,
        kind: 'enrichment',
        recipe: 'web-research',
        prompt,
        width: 380,
        group: 'Research',
        codexResearch: researchModelSettings,
        researchProvider: researchBuilderProvider,
        description: 'Custom research grounded in the live public web.',
        requires: 'Research provider key + public web',
      });
      setResearchBuilderOpen(false);
      return;
    }

    const drafts = researchFields.filter((field) => field.title.trim());
    if (drafts.length < (researchOutputMode === 'list' ? 1 : 2)) return;
    const used = new Set(workspace.columns.map((column) => column.id));
    const usedTitles = new Set(
      workspace.columns.map((column) => column.title.trim().toLowerCase()),
    );
    const outputFields = drafts.map((field) => {
      const title = uniqueTitle(field.title.trim(), usedTitles);
      return {
        id: uniqueId(slugify(title), used),
        title,
        valueType: field.valueType,
      };
    });
    const [primary, ...supporting] = outputFields;
    const researchColumn: PomadeColumn = {
      ...primary,
      kind: 'enrichment',
      recipe: 'web-research',
      prompt,
      outputFields,
      codexResearch: researchModelSettings,
      researchProvider: researchBuilderProvider,
      outputCardinality: researchOutputMode === 'list' ? 'list' : undefined,
      listLimit:
        researchOutputMode === 'list'
          ? Math.min(25, Math.max(1, researchListLimit))
          : undefined,
      width: 320,
    };
    const supportingColumns: PomadeColumn[] = supporting.map((field) => ({
      ...field,
      kind: 'text',
      width: field.valueType === 'text' ? 280 : 160,
    }));
    setWorkspace((current) => {
      const addedColumns = [researchColumn, ...supportingColumns];
      return {
        ...current,
        columns: [
          ...current.columns.filter((column) => column.kind !== 'status'),
          ...addedColumns,
          ...current.columns.filter((column) => column.kind === 'status'),
        ],
        rows: current.rows.map((row) => ({
          ...row,
          values: {
            ...row.values,
            ...Object.fromEntries(outputFields.map((field) => [field.id, ''])),
          },
        })),
        schedule: current.schedule?.enabled
          ? pauseRecipeSchedule(current.schedule)
          : current.schedule,
        updatedAt: Date.now(),
      };
    });
    setResearchBuilderOpen(false);
    setNotice(
      researchOutputMode === 'list'
        ? `${outputFields.length} fields are ready to create up to ${Math.min(25, Math.max(1, researchListLimit))} rows per source row${workspace.schedule?.enabled ? ' · schedule paused for new provider scope' : ''}.`
        : `${outputFields.length} structured research columns are ready to run${workspace.schedule?.enabled ? ' · schedule paused for new provider scope' : ''}.`,
    );
  }

  function addBlankRow() {
    if (jobLocksWorkspace) return;
    if (workspace.rows.length >= 5_000) {
      setNotice(
        'This sheet has reached its 5,000-row limit. Start another sheet to add more records.',
      );
      return;
    }
    const id = crypto.randomUUID();
    setWorkspace((current) => ({
      ...current,
      rows: [
        ...current.rows,
        {
          id,
          values: Object.fromEntries(
            current.columns.map((column) => [column.id, '']),
          ),
        },
      ],
      updatedAt: Date.now(),
    }));
    setActiveRowId(id);
    setQuery('');
    setSelectedRowIds([]);
    setFilter('All');
    setActiveSavedViewId('');
  }

  function deleteRows() {
    const rowIds = selectedRowIds.length
      ? selectedRowIds
      : selected
        ? [selected.id]
        : [];
    if (!rowIds.length || jobLocksWorkspace) return;
    const selectedSet = new Set(rowIds);
    const hasGeneratedChildren = workspace.rows.some(
      (row) => row.parentRowId && selectedSet.has(row.parentRowId),
    );
    const extra = hasGeneratedChildren
      ? ' This also removes their generated descendant rows.'
      : '';
    if (
      !window.confirm(
        `Delete ${rowIds.length} selected ${rowIds.length === 1 ? 'row' : 'rows'}?${extra}`,
      )
    )
      return;
    const result = deleteWorkspaceRows(workspace, rowIds);
    setWorkspace(result.workspace);
    setActiveRowId(result.workspace.rows[0]?.id ?? '');
    setSelectedRowIds([]);
    setNotice(
      `${result.removedCount} ${result.removedCount === 1 ? 'row' : 'rows'} deleted${result.schedulePaused ? ' · empty schedule scope paused' : ''}.`,
    );
  }

  function sortRows() {
    setWorkspace((current) => ({
      ...current,
      rows: [...current.rows].sort((a, b) => {
        const result = (a.values.company ?? '').localeCompare(
          b.values.company ?? '',
        );
        return sortAscending ? result : -result;
      }),
      updatedAt: Date.now(),
    }));
    setSelectedRowIds([]);
    setSortAscending((current) => !current);
  }

  function openSavedViewBuilder() {
    const statusColumn = workspace.columns.find(
      (column) => column.kind === 'status',
    );
    const firstColumn = statusColumn ?? workspace.columns[0];
    setSavedViewName('Priority targets');
    setSavedViewColumnId(firstColumn?.id ?? '');
    setSavedViewOperator(statusColumn ? 'equals' : 'is_not_empty');
    setSavedViewValue(statusColumn ? 'Ready' : '');
    setSavedViewError('');
    setSavedViewOpen(true);
  }

  function saveCurrentView() {
    try {
      const view = createSavedView(workspace, {
        id: crypto.randomUUID(),
        name: savedViewName,
        columnId: savedViewColumnId,
        operator: savedViewOperator,
        value: savedViewValue,
      });
      setWorkspace((current) => ({
        ...current,
        savedViews: [...(current.savedViews ?? []), view],
        updatedAt: Date.now(),
      }));
      setSelectedRowIds([]);
      setFilter('All');
      setQuery('');
      setActiveSavedViewId(view.id);
      setSavedViewOpen(false);
      setNotice(`${view.name} saved to this workspace.`);
    } catch (error) {
      setSavedViewError(
        error instanceof Error ? error.message : 'The view could not be saved.',
      );
    }
  }

  function deleteSavedView(viewId: string, name: string) {
    if (!window.confirm(`Delete the saved view “${name}”?`)) return;
    setWorkspace((current) => ({
      ...current,
      savedViews: (current.savedViews ?? []).filter(
        (view) => view.id !== viewId,
      ),
      updatedAt: Date.now(),
    }));
    if (activeSavedViewId === viewId) setActiveSavedViewId('');
    setNotice(`${name} removed.`);
  }

  function importCsv(file: File) {
    setSourcesOpen(false);
    setCsvFile(file);
  }

  function exportCsv() {
    setExportOpen(true);
  }

  function openControlTowerHandoff() {
    const suggestions = suggestControlTowerMappings(
      workspace.columns,
      handoffProvider,
    );
    setHandoffMappingByColumn(
      Object.fromEntries(
        suggestions.map((mapping) => [
          mapping.sourceColumnId,
          mapping.contactField,
        ]),
      ),
    );
    setHandoffOpen(true);
  }

  function downloadControlTowerPlan() {
    const blob = new Blob([JSON.stringify(handoffPlan, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slugify(workspace.name)}_${handoffProvider}_control_tower_preview.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(
      `${handoffPlan.records.length} rows and ${handoffPlan.fieldMappings.length} mapped fields packaged for Control Tower preview.`,
    );
    setHandoffOpen(false);
  }

  function resetSample() {
    if (!window.confirm('Reset this table to the Pomade sample workspace?'))
      return;
    const sample = createSampleWorkspace();
    sample.id = workspace.id;
    sample.recipeTemplates = workspace.recipeTemplates ?? [];
    const sampleColumnIds = new Set(sample.columns.map((column) => column.id));
    sample.savedViews = (workspace.savedViews ?? []).filter((view) =>
      sampleColumnIds.has(view.columnId),
    );
    setWorkspace(sample);
    setActiveRowId(sample.rows[0]?.id ?? '');
    setSelectedRowIds([]);
    setFilter('All');
    setActiveSavedViewId('');
    setQuery('');
    setNotice('Sample workspace restored.');
  }

  async function openVersionHistory() {
    setVersionsOpen(true);
    setVersionsLoading(true);
    setVersionsError('');
    try {
      const response = await fetch(versionsUrl);
      const result = (await response.json()) as {
        versions?: WorkspaceVersionSummary[];
        error?: string;
      };
      if (!response.ok || !result.versions) {
        throw new Error(result.error || 'Version history failed to load.');
      }
      setWorkspaceVersions(result.versions);
    } catch (error) {
      setVersionsError(
        error instanceof Error
          ? error.message
          : 'Version history failed to load.',
      );
    } finally {
      setVersionsLoading(false);
    }
  }

  async function restoreWorkspaceVersion(version: WorkspaceVersionSummary) {
    if (restoringVersionId || jobLocksWorkspace) return;
    if (!canLeaveTable) {
      setVersionsError(
        'Finish saving your changes before restoring. Close this dialog and use Retry save if needed.',
      );
      return;
    }
    if (
      !window.confirm(
        `Restore the ${runTime(version.createdAt)} version? Your current table will be kept as a recoverable version.`,
      )
    )
      return;
    setRestoringVersionId(version.id);
    setVersionsError('');
    try {
      await saveQueue.current;
      const response = await fetch(versionsUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versionId: version.id }),
      });
      const result = (await response.json()) as {
        workspace?: WorkspaceSnapshot;
        error?: string;
      };
      if (!response.ok || !result.workspace) {
        throw new Error(result.error || 'The version could not be restored.');
      }
      setSavedWorkspace(result.workspace);
      setWorkspace(result.workspace);
      setActiveRowId(result.workspace.rows[0]?.id ?? '');
      setSelectedRowIds([]);
      setFilter('All');
      setActiveSavedViewId('');
      setQuery('');
      setSaveState('Saved');
      setVersionsOpen(false);
      setNotice(
        `Restored ${version.rowCount} rows and ${version.columnCount} columns. The previous table remains in version history.`,
      );
    } catch (error) {
      setVersionsError(
        error instanceof Error
          ? error.message
          : 'The version could not be restored.',
      );
    } finally {
      setRestoringVersionId('');
    }
  }

  function openApollo() {
    setApolloError('');
    setApolloResult(undefined);
    setApolloBatchSummary(undefined);
    setApolloOpen(true);
  }

  function rememberRun(run: RunReceipt) {
    setLatestRun(run);
    setRunHistory((current) =>
      [run, ...current.filter((item) => item.id !== run.id)].slice(0, 10),
    );
  }

  async function enrichSelectedWithApollo() {
    if (!apolloEligibleRows.length || apolloRunning) return;
    setApolloRunning(true);
    setApolloError('');
    setApolloResult(undefined);
    setApolloBatchSummary(undefined);
    try {
      await saveQueue.current;
      const response = await fetch('/api/providers/apollo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspace: mergeWorkspaceEdits(
            savedWorkspace ?? workspace,
            workspace,
            lastSaved.current ?? workspace,
          ),
          baseWorkspace: lastSaved.current,
          rowIds: apolloTargetRows.map((row) => row.id),
          confirmCreditSpend: true,
        }),
      });
      const result = (await response.json()) as {
        workspace?: WorkspaceSnapshot;
        run?: RunReceipt;
        enrichment?: ApolloEnrichmentResult;
        summary?: Omit<ApolloBatchSummary, 'creditsConsumed'>;
        failures?: Array<{ rowId: string; error: string }>;
        error?: string;
      };
      if (
        !response.ok ||
        !result.workspace ||
        !result.run ||
        !result.enrichment
      ) {
        throw new Error(result.error || 'Apollo enrichment failed.');
      }
      setSavedWorkspace(result.workspace);
      setWorkspace(result.workspace);
      rememberRun(result.run);
      setApolloResult(result.enrichment);
      setApolloBatchSummary({
        requested: result.summary?.requested ?? result.run.rowCount,
        completed: result.summary?.completed ?? result.run.rowCount,
        failed: result.summary?.failed ?? 0,
        skipped: result.summary?.skipped ?? 0,
        creditsConsumed: result.run.creditsConsumed ?? null,
      });
      if (result.failures?.length) {
        setApolloError(
          `${result.failures.length} ${result.failures.length === 1 ? 'row' : 'rows'} failed and stayed unchanged. ${result.failures[0].error}`,
        );
      }
      setSaveState('Saved');
      setNotice(
        `${result.run.rowCount} Apollo ${result.run.rowCount === 1 ? 'row' : 'rows'} enriched${result.summary?.failed ? ` · ${result.summary.failed} failed` : ''}${result.summary?.skipped ? ` · ${result.summary.skipped} skipped` : ''}.`,
      );
    } catch (error) {
      setApolloError(
        error instanceof Error ? error.message : 'Apollo enrichment failed.',
      );
    } finally {
      setApolloRunning(false);
    }
  }

  async function runEnrichment(
    rowIds = runTargetIds,
    confirmExternalResearch = false,
    columnIds?: string[],
  ) {
    if (running || rowIds.length === 0 || columnIds?.length === 0) return;
    if (
      workspace.columns.some(
        (column) =>
          (!columnIds || columnIds.includes(column.id)) &&
          (hasAsyncProvider(column) ||
            (deployment.hosted &&
              column.recipe === 'web-research' &&
              (column.researchProvider ?? researchStatus?.provider) ===
                'codex')),
      )
    )
      return queueBackgroundRun(rowIds, confirmExternalResearch, columnIds);
    const target = new Set(rowIds);
    const eligibleResearchActions = countMaximumExternalActions(
      workspace.rows.filter((row) => target.has(row.id)),
      columnIds
        ? webResearchColumns.filter((column) => columnIds.includes(column.id))
        : webResearchColumns,
    );
    if (eligibleResearchActions > 0 && !confirmExternalResearch) {
      setPendingRunRowIds(rowIds);
      setPendingRunColumnIds(
        columnIds ?? recipeColumns.map((column) => column.id),
      );
      setPendingRunMode('immediate');
      setResearchConfirmOpen(true);
      return;
    }
    setRunning(true);
    setWorkspace((current) => ({
      ...current,
      rows: current.rows.map((row) =>
        target.has(row.id)
          ? { ...row, values: { ...row.values, status: 'Running' } }
          : row,
      ),
    }));
    try {
      await saveQueue.current;
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspace: mergeWorkspaceEdits(
            savedWorkspace ?? workspace,
            workspace,
            lastSaved.current ?? workspace,
          ),
          baseWorkspace: lastSaved.current,
          rowIds,
          columnIds,
          confirmExternalResearch,
        }),
      });
      const result = (await response.json()) as {
        workspace?: WorkspaceSnapshot;
        run?: RunReceipt;
        error?: string;
      };
      if (!response.ok || !result.workspace || !result.run) {
        throw new Error(result.error || 'The recipe run failed.');
      }
      setSavedWorkspace(result.workspace);
      setWorkspace(result.workspace);
      rememberRun(result.run);
      setSaveState('Saved');
      const skipped = result.run.skippedCount ?? 0;
      const createdRows = result.run.receipts.reduce(
        (total, receipt) => total + (receipt.createdRowCount ?? 0),
        0,
      );
      setNotice(
        `${result.run.actionCount} actions finished across ${result.run.rowCount} rows${createdRows ? ` · ${createdRows} new rows created` : ''}${skipped ? ` · ${skipped} skipped by rules` : ''}.`,
      );
    } catch (error) {
      setWorkspace((current) => ({
        ...current,
        rows: current.rows.map((row) =>
          target.has(row.id)
            ? { ...row, values: { ...row.values, status: 'Review' } }
            : row,
        ),
      }));
      setSaveState('Offline');
      setNotice(
        error instanceof Error ? error.message : 'The recipe run failed.',
      );
    } finally {
      setRunning(false);
    }
  }

  async function queueBackgroundRun(
    rowIds = runTargetIds,
    confirmExternalResearch = false,
    columnIds?: string[],
  ) {
    if (jobSaving || !rowIds.length || columnIds?.length === 0) return;
    if (rowIds.length > MAX_BACKGROUND_ROWS) {
      setJobError(
        `Select ${MAX_BACKGROUND_ROWS} rows or fewer for one background run.`,
      );
      setBackgroundRunsOpen(true);
      return;
    }
    const activeJob = runJobs.find((job) =>
      ['queued', 'running', 'paused'].includes(job.status),
    );
    if (activeJob) {
      setJobError(
        'Finish or resume the existing background run before starting another.',
      );
      setBackgroundRunsOpen(true);
      return;
    }
    const target = new Set(rowIds);
    const scopedResearchColumns = columnIds
      ? webResearchColumns.filter((column) => columnIds.includes(column.id))
      : webResearchColumns;
    const researchActionCount = countMaximumExternalActions(
      workspace.rows.filter((row) => target.has(row.id)),
      scopedResearchColumns,
    );
    if (researchActionCount > 0 && !confirmExternalResearch) {
      setPendingRunRowIds(rowIds);
      setPendingRunColumnIds(
        columnIds ?? recipeColumns.map((column) => column.id),
      );
      setPendingRunMode('background');
      setResearchConfirmOpen(true);
      return;
    }

    setJobSaving(true);
    setJobError('');
    try {
      await saveQueue.current;
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspace: mergeWorkspaceEdits(
            savedWorkspace ?? workspace,
            workspace,
            lastSaved.current ?? workspace,
          ),
          baseWorkspace: lastSaved.current,
          rowIds,
          columnIds,
          confirmExternalResearch,
        }),
      });
      const result = (await response.json()) as {
        job?: RunJob;
        error?: string;
      };
      if (!response.ok || !result.job) {
        throw new Error(
          result.error || 'The background run could not be queued.',
        );
      }
      jobRevision.current = Math.max(jobRevision.current, result.job.updatedAt);
      setRunJobs((current) => [
        result.job!,
        ...current.filter((job) => job.id !== result.job?.id),
      ]);
      setBackgroundRunsOpen(true);
      setNotice(
        `${result.job.rowIds.length} ${result.job.rowIds.length === 1 ? 'row' : 'rows'} queued for background processing.`,
      );
    } catch (error) {
      setJobError(
        error instanceof Error
          ? error.message
          : 'The background run could not be queued.',
      );
      setBackgroundRunsOpen(true);
    } finally {
      setJobSaving(false);
    }
  }

  async function updateRunJob(
    job: RunJob,
    action: 'pause' | 'resume' | 'cancel',
  ) {
    setJobSaving(true);
    setJobError('');
    try {
      const response = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, action }),
      });
      const result = (await response.json()) as {
        job?: RunJob;
        workspace?: WorkspaceSnapshot;
        error?: string;
      };
      if (!response.ok || !result.job) {
        throw new Error(result.error || `The job could not ${action}.`);
      }
      jobRevision.current = Math.max(jobRevision.current, result.job.updatedAt);
      setRunJobs(
        (current) =>
          current.map((candidate) =>
            candidate.id === result.job?.id ? result.job : candidate,
          ) as RunJob[],
      );
      if (result.workspace) {
        const merged = mergeWorkspaceEdits(
          lastSaved.current ?? workspace,
          latestLocal.current,
          result.workspace,
        );
        lastSaved.current = result.workspace;
        setSavedWorkspace(result.workspace);
        setWorkspace(merged);
      }
      setNotice(
        action === 'pause'
          ? 'Background run paused after any in-flight row finishes.'
          : action === 'cancel'
            ? 'Run cancelled. Start a new background run for fresh lookups; those can use new provider credits.'
            : 'Resuming saved progress and provider requests.',
      );
    } catch (error) {
      setJobError(
        error instanceof Error ? error.message : `The job could not ${action}.`,
      );
    } finally {
      setJobSaving(false);
    }
  }

  function openSources() {
    if (savedSource) {
      setSourceObjects((current) => ({
        ...current,
        [savedSource.provider]: savedSource.objectType,
      }));
      setSourceFields((current) => ({
        ...current,
        [savedSource.provider]: savedSource.fields.join(', '),
      }));
      if (savedSource.provider === 'hubspot')
        setHubSpotSegmentId(savedSource.segmentId ?? 'all');
    }
    setSourcePreview(undefined);
    setSourceError('');
    setSourcesOpen(true);
  }

  function refreshSavedCrmSource() {
    if (!savedSource || sourceLoading || jobLocksWorkspace) return;
    openSources();
    void previewCrmSource(savedSource.provider, undefined, savedSource);
  }

  async function previewCrmSource(
    provider: CrmProvider,
    after?: string,
    saved?: SavedCrmSource,
  ) {
    sourceRequest.current?.abort();
    const controller = new AbortController();
    sourceRequest.current = controller;
    const previous = sourcePreview;
    setSourceLoading(provider);
    setSourceError('');
    if (!after) setSourcePreview(undefined);
    try {
      const response = await fetch('/api/providers/crm', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          objectType:
            saved?.objectType ??
            (after ? previous?.objectType : undefined) ??
            sourceObjects[provider],
          segmentId: saved
            ? saved.segmentId
            : provider === 'hubspot' && hubSpotSegmentId !== 'all'
              ? hubSpotSegmentId
              : undefined,
          after,
          fields:
            saved?.fields ??
            (after
              ? previous?.fields
              : sourceFields[provider]
                  .split(',')
                  .map((f) => f.trim())
                  .filter(Boolean)),
          limit: after
            ? Math.min(100, 5_000 - (previous?.contacts.length ?? 0))
            : 100,
        }),
      });
      const result = (await response.json()) as {
        preview?: CrmSourcePreview;
        error?: string;
      };
      if (!response.ok || !result.preview) {
        throw new Error(result.error || 'The CRM source could not be read.');
      }
      if (controller.signal.aborted) return;
      setSourcePreview(
        after && previous
          ? mergeCrmSourcePages(previous, result.preview)
          : result.preview,
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setSourceError(
          error instanceof Error
            ? error.message
            : 'The CRM source could not be read.',
        );
    } finally {
      if (sourceRequest.current === controller) setSourceLoading(undefined);
    }
  }

  function importCrmPreview(mode: CrmImportMode) {
    if (!sourcePreview) return;
    let imported: WorkspaceSnapshot;
    try {
      imported = applyCrmImport(workspace, sourcePreview, mode);
    } catch (error) {
      setSourceError(
        error instanceof Error
          ? error.message
          : 'The CRM records could not be imported.',
      );
      return;
    }
    const next =
      mode === 'replace' && imported.schedule?.enabled
        ? {
            ...imported,
            schedule: pauseRecipeSchedule(imported.schedule),
          }
        : imported;
    setWorkspace(next);
    setActiveRowId(next.rows[0]?.id ?? '');
    setSelectedRowIds([]);
    setFilter('All');
    setActiveSavedViewId('');
    setQuery('');
    setSourcesOpen(false);
    setNotice(
      `${sourcePreview.contacts.length} ${sourcePreview.sourceLabel.toLowerCase()} ${
        mode === 'append' ? 'merged into' : 'loaded into'
      } the grid${mode === 'replace' && workspace.schedule?.enabled ? ' · schedule paused for review' : ''}.`,
    );
  }

  function openRunReceipt(run?: RunReceipt) {
    if (!run) return;
    setReceiptRun(run);
    setReceiptPage(0);
    setReceiptQuery('');
    setReceiptStatus('all');
    setReceiptOpen(true);
  }

  function openRename() {
    setWorkspaceNameDraft(workspace.name);
    setRenameOpen(true);
  }

  function renameWorkspace() {
    const name = workspaceNameDraft.trim();
    if (!name) return;
    setWorkspace((current) => ({
      ...current,
      name,
      updatedAt: Date.now(),
    }));
    setRenameOpen(false);
  }

  function openScheduleBuilder() {
    if (!deployment.schedulesEnabled) {
      setNotice(
        'Scheduled automations are paused on this hosted copy. Manual and background runs are available.',
      );
      return;
    }
    const now = Date.now();
    const existing = workspace.schedule;
    const nextRunAt =
      existing?.nextRunAt && existing.nextRunAt > now
        ? existing.nextRunAt
        : new Date(defaultScheduleTime()).getTime();
    setScheduleCrmIds(existing?.afterRunCrm?.map((c) => c.mappingId) ?? []);
    setScheduleCrmCondition(existing?.afterRunCrm?.[0]?.condition);
    setScheduleCrmConfirmed(false);
    setScheduleSourceEnabled(Boolean(existing?.beforeRunSource));
    setScheduleSourceConfirmed(false);
    setScheduleFunctionId(existing?.functionInstanceId ?? '');
    setScheduleTransferIds(
      (
        existing?.afterRunTransfers ??
        (existing?.afterRunTransfer ? [existing.afterRunTransfer] : [])
      ).map((r) => r.id),
    );
    setScheduleNow(now);
    setScheduleCadence(existing?.cadence ?? 'once');
    setScheduleRunAt(dateTimeInputValue(nextRunAt));
    setScheduleTarget(
      existing?.target ?? (selectedRowIds.length ? 'selected' : 'all'),
    );
    setScheduleRowIds(
      existing?.target === 'selected'
        ? (existing.rowIds ?? [])
        : selectedRowIds,
    );
    setScheduleConfirmsResearch(Boolean(existing?.confirmExternalResearch));
    setScheduleError('');
    setScheduleOpen(true);
  }

  function saveRecipeSchedule() {
    try {
      if (scheduleScopeError) throw new Error(scheduleScopeError);
      if (scheduleHasUnfinishedRun)
        throw new Error(
          'Resume or cancel the saved run in Background runs before replacing its schedule.',
        );
      const afterRunTransfers = scheduleTransferIds.map((id) => {
        const rule = workspace.tableTransfers?.find((r) => r.id === id);
        if (!rule) throw new Error('Choose existing saved transfer rules.');
        return rule;
      });
      const schedule = createRecipeSchedule({
        id: workspace.schedule?.id ?? crypto.randomUUID(),
        beforeRunSource: scheduleSourceEnabled
          ? workspace.apiSourceRefresh
          : undefined,
        functionInstanceId: scheduleFunctionId,
        afterRunCrm: scheduleCrmIds.map((id) => {
          const mapping = workspace.crmMappings?.find((m) => m.id === id);
          if (!mapping) throw new Error('Choose existing CRM mappings.');
          return {
            mappingId: id,
            name: mapping.name,
            config: mapping.config,
            condition: scheduleCrmCondition,
          };
        }),
        confirmCrmWrites: scheduleCrmConfirmed,
        afterRunTransfers,
        cadence: scheduleCadence,
        nextRunAt: scheduleTimestamp,
        rowIds: scheduleTarget === 'selected' ? scheduleRowIds : undefined,
      });
      setWorkspace((current) => ({
        ...current,
        schedule: {
          ...current.schedule,
          ...schedule,
          createdAt: current.schedule?.createdAt ?? schedule.createdAt,
          lastError: undefined,
          leaseUntil: undefined,
        },
        updatedAt: Date.now(),
      }));
      setScheduleOpen(false);
      setNotice(
        `${cadenceLabel(schedule.cadence)} run scheduled for ${runTime(schedule.nextRunAt ?? scheduleTimestamp)}.`,
      );
    } catch (error) {
      setScheduleError(
        error instanceof Error
          ? error.message
          : 'The schedule could not be saved.',
      );
    }
  }

  function pauseSchedule() {
    if (!workspace.schedule) return;
    if (savedScheduleJob && scheduleHasUnfinishedRun) {
      void updateRunJob(savedScheduleJob, 'pause');
      setScheduleOpen(false);
      return;
    }
    setWorkspace((current) =>
      current.schedule
        ? {
            ...current,
            schedule: pauseRecipeSchedule(current.schedule),
            updatedAt: Date.now(),
          }
        : current,
    );
    setScheduleOpen(false);
    setNotice('Scheduled recipe runs paused.');
  }

  if (!loaded)
    return (
      <main
        className="pomade-shell workbook-loading"
        aria-busy={saveState !== 'Offline'}
      >
        {saveState !== 'Offline' ? (
          <LoaderCircle className="spin" aria-hidden="true" />
        ) : (
          <Info aria-hidden="true" />
        )}
        <p>
          {saveState === 'Offline'
            ? 'This table could not be loaded. Your saved data has not been replaced.'
            : 'Loading table…'}
        </p>
        {saveState === 'Offline' ? (
          <Button onClick={() => window.location.reload()}>Retry</Button>
        ) : null}
      </main>
    );

  return (
    <main className="pomade-shell">
      <header className="topbar">
        <div className="sheet-heading">
          <Button
            variant="ghost"
            size="icon"
            aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
            aria-expanded={sidebarOpen}
            aria-controls="sheet-navigation"
            onClick={() => setSidebarOpen((value) => !value)}
          >
            <PanelLeft />
          </Button>
          <div>
            <p className="sheet-eyebrow">
              {activeSavedView?.name ??
                (filter === 'All'
                  ? 'All records'
                  : filter === 'Ready'
                    ? 'Ready to use'
                    : 'Needs review')}
            </p>
            <h1>
              <button
                className="workspace-name"
                type="button"
                onClick={openRename}
                disabled={jobLocksWorkspace}
                title="Rename sheet"
              >
                {workspace.name}
                <Pencil aria-hidden="true" />
              </button>
            </h1>
          </div>
          <span
            className="deployment-badge"
            title={
              deployment.hosted
                ? 'Saved securely online. Local sheets are separate.'
                : 'Saved on this Mac. Hosted sheets are separate.'
            }
          >
            {deployment.label}
          </span>
        </div>
        <div className="topbar-actions">
          {currentRunJob ? (
            <button
              className={`schedule-pill run-job-pill run-job-pill-${currentRunJob.status}`}
              type="button"
              onClick={() => setBackgroundRunsOpen(true)}
            >
              {currentRunJob.status === 'running' ? (
                <LoaderCircle className="spin" />
              ) : (
                <Cloud />
              )}
              <span>
                {currentRunJob.status === 'completed'
                  ? 'Background run complete'
                  : `${runJobPercent(currentRunJob)}% · ${currentRunJob.status}`}
              </span>
            </button>
          ) : null}
          {workspace.schedule ? (
            <button
              className={`schedule-pill schedule-pill-${workspace.schedule.state}`}
              type="button"
              onClick={openScheduleBuilder}
              disabled={jobLocksWorkspace}
            >
              <CalendarClock />
              <span>
                {workspace.schedule.enabled && workspace.schedule.nextRunAt
                  ? `Next ${runTime(workspace.schedule.nextRunAt)}`
                  : workspace.schedule.state === 'failed'
                    ? 'Schedule needs attention'
                    : workspace.schedule.state === 'complete'
                      ? 'Schedule complete'
                      : 'Schedule paused'}
              </span>
            </button>
          ) : null}
          <output
            className={`sync-state sync-${saveState.toLowerCase()}`}
            aria-live="polite"
          >
            {saveState === 'Saving' ? (
              <LoaderCircle className="spin" />
            ) : (
              <Cloud />
            )}{' '}
            {saveState}
          </output>
          <button
            className={`usage-pill ${connectedCount ? 'usage-pill-connected' : ''}`}
            type="button"
            onClick={openSources}
          >
            <Plug />
            <strong>{connectedCount}</strong> sources
          </button>
        </div>
      </header>
      <WorkbookPlanGuide
        key={`plan-${workspace.id}`}
        workspace={workspace}
        ready={canLeaveTable && !jobLocksWorkspace}
        onOpenTable={onOpenTable}
        onBusyChange={setWorkbookRunning}
        onRun={(columnId) => void runEnrichment(undefined, false, [columnId])}
      />

      <div
        className="workspace-layout"
        data-sidebar={sidebarOpen ? 'open' : 'closed'}
        data-inspector={inspectorOpen ? 'open' : 'closed'}
      >
        <aside className="sidebar" id="sheet-navigation" hidden={!sidebarOpen}>
          <p className="sidebar-label">Workspace</p>
          <nav aria-label="Workspace navigation">
            <button
              className={`nav-item ${filter === 'All' && !activeSavedViewId ? 'active' : ''}`}
              type="button"
              onClick={clearView}
              aria-current={
                filter === 'All' && !activeSavedViewId ? 'page' : undefined
              }
            >
              <Table2 /> All records <span>{workspace.rows.length}</span>
            </button>
            <button
              className="nav-item"
              type="button"
              onClick={() => setHistoryOpen(true)}
            >
              <History /> Run history{' '}
              <span title={historyError || undefined}>
                {historyError ? '!' : runHistory.length}
              </span>
            </button>
            <button
              className="nav-item"
              type="button"
              onClick={() => setBackgroundRunsOpen(true)}
            >
              <Cloud /> Background runs <span>{runJobs.length}</span>
            </button>
            <button className="nav-item" type="button" onClick={openSources}>
              <Database /> Connections <span>{connectedCount}</span>
            </button>
            <button
              className="nav-item"
              type="button"
              onClick={openColumnPicker}
              disabled={jobLocksWorkspace}
            >
              <Library /> Recipe library{' '}
              <span>{recipeTemplates.length + RESEARCH_RECIPES.length}</span>
            </button>
          </nav>
          <p className="sidebar-label sidebar-label-spaced">Saved views</p>
          <nav aria-label="Saved views">
            <button
              className={`nav-item ${filter === 'Ready' ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setSelectedRowIds([]);
                setActiveSavedViewId('');
                setFilter(filter === 'Ready' ? 'All' : 'Ready');
              }}
            >
              <Check /> Ready to use <span>{readyCount}</span>
            </button>
            <button
              className={`nav-item ${filter === 'Review' ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setSelectedRowIds([]);
                setActiveSavedViewId('');
                setFilter(filter === 'Review' ? 'All' : 'Review');
              }}
            >
              <Search /> Needs review <span>{reviewCount}</span>
            </button>
            {(workspace.savedViews ?? []).map((view) => (
              <div className="saved-view-nav" key={view.id}>
                <button
                  className={`nav-item ${activeSavedViewId === view.id ? 'active' : ''}`}
                  type="button"
                  onClick={() => {
                    setSelectedRowIds([]);
                    setFilter('All');
                    setActiveSavedViewId(
                      activeSavedViewId === view.id ? '' : view.id,
                    );
                  }}
                >
                  <BookmarkPlus /> {view.name}
                  <span>
                    {
                      workspace.rows.filter((row) =>
                        rowMatchesSavedView(row, view),
                      ).length
                    }
                  </span>
                </button>
                <button
                  className="saved-view-delete"
                  type="button"
                  aria-label={`Delete ${view.name}`}
                  onClick={() => deleteSavedView(view.id, view.name)}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
            <button
              className="nav-item nav-item-add"
              type="button"
              onClick={openSavedViewBuilder}
              disabled={jobLocksWorkspace}
            >
              <Plus /> Save a view
            </button>
          </nav>
          <button
            className="new-table"
            type="button"
            onClick={openColumnPicker}
            disabled={jobLocksWorkspace}
          >
            <Plus /> Add column
          </button>
          <button
            className="engine-card"
            type="button"
            onClick={() => setRecipeSettingsOpen(true)}
            disabled={jobLocksWorkspace}
          >
            <span className="engine-icon">
              <Braces />
            </span>
            <div>
              <strong>Recipe engine</strong>
              <span>
                {automaticFormulaCount} automatic · {conditionCount} rules
              </span>
            </div>
            <span className="live-dot" />
          </button>
        </aside>

        <section className="grid-workspace">
          <CrmRefreshPanel
            key={`crm-refresh-${workspace.id}`}
            workspace={workspace}
            ready={canLeaveTable && !jobLocksWorkspace}
            hosted={deployment.hosted}
            onRefresh={(remote) => {
              try {
                const next = reconcileWorkspaceUpdate(
                  lastSaved.current ?? workspace,
                  latestLocal.current,
                  remote,
                );
                lastSaved.current = next.saved;
                latestLocal.current = next.workspace;
                setSavedWorkspace(next.saved);
                setWorkspace(next.workspace);
                setSaveState(
                  next.workspace === next.saved ? 'Saved' : 'Saving',
                );
              } catch (error) {
                setSaveState('Offline');
                throw error;
              }
            }}
          />
          <div className="table-toolbar">
            <div className="tool-group-triggers" aria-label="Sheet tools">
              {(
                [
                  { id: 'data', label: 'Add data', icon: Database },
                  { id: 'enrich', label: 'Enrich', icon: Sparkles },
                  { id: 'automate', label: 'Automate', icon: Workflow },
                  { id: 'send', label: 'Send', icon: Upload },
                ] as const
              ).map((group) => (
                <button
                  type="button"
                  key={group.id}
                  className={toolGroup === group.id ? 'active' : ''}
                  aria-expanded={toolGroup === group.id}
                  aria-controls={`tools-${group.id}`}
                  onClick={() =>
                    setToolGroup((value) =>
                      value === group.id ? '' : group.id,
                    )
                  }
                >
                  <group.icon aria-hidden="true" />
                  {group.label}
                  <ChevronDown aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="toolbar-cluster toolbar-actions">
              {selectedRowIds.length ? (
                <span className="selection-chip">
                  {selectedRowIds.length} selected
                </span>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" />}>
                  More <ChevronDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={addBlankRow}
                    disabled={
                      jobLocksWorkspace || workspace.rows.length >= 5_000
                    }
                    title={
                      workspace.rows.length >= 5_000
                        ? '5,000-row limit reached; start another sheet.'
                        : undefined
                    }
                  >
                    <Plus /> Add blank row
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={deleteRows}
                    disabled={!selected || jobLocksWorkspace}
                  >
                    <Trash2 />
                    {selectedRowIds.length > 1
                      ? `Delete ${selectedRowIds.length} selected rows`
                      : 'Delete active row'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={openApollo}
                    disabled={!selected || jobLocksWorkspace}
                  >
                    <MailCheck />
                    {selectedRowIds.length
                      ? 'Enrich selected with Apollo'
                      : 'Enrich active row with Apollo'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => openProviderCatalog('research')}
                    disabled={jobLocksWorkspace}
                  >
                    <Globe2 /> Add AI web research
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={openCompanyListBuilder}
                    disabled={jobLocksWorkspace}
                  >
                    <Building2 /> Find target companies
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={openPeopleListBuilder}
                    disabled={
                      jobLocksWorkspace ||
                      !selected ||
                      (!selected.values.company?.trim() &&
                        !selected.values.domain?.trim())
                    }
                  >
                    <Users /> Find people at this company
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setRecipeSettingsOpen(true)}
                    disabled={jobLocksWorkspace}
                  >
                    <SlidersHorizontal /> Recipe run settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={openScheduleBuilder}
                    disabled={recipeCount === 0 || jobLocksWorkspace}
                  >
                    <CalendarClock /> Schedule recipe run
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void queueBackgroundRun()}
                    disabled={recipeCount === 0 || jobSaving}
                  >
                    <Cloud /> Run in background
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onCopyRows(selectedRowIds)}
                    disabled={
                      !canLeaveTable ||
                      jobLocksWorkspace ||
                      selectedRowIds.length === 0
                    }
                  >
                    <Copy /> Send selected rows to new table
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportCsv}>
                    <Download /> Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={openControlTowerHandoff}
                    disabled={!handoffPlan.records.length}
                  >
                    <ShieldCheck /> Prepare CRM handoff
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void openVersionHistory()}
                    disabled={jobLocksWorkspace}
                  >
                    <History /> Version history
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={resetSample}
                    disabled={jobLocksWorkspace}
                  >
                    <RotateCcw /> Restore sample data
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                className="run-button"
                onClick={() => runEnrichment()}
                disabled={
                  running ||
                  jobLocksWorkspace ||
                  runTargetIds.length === 0 ||
                  recipeCount === 0
                }
              >
                {running ? <LoaderCircle className="spin" /> : <Play />}
                {running
                  ? 'Running…'
                  : `Run ${runTargetIds.length}${selectedRowIds.length ? ' selected' : filter === 'All' && !query && !activeSavedView ? '' : ' visible'} ${runTargetIds.length === 1 ? 'row' : 'rows'}`}
              </Button>
            </div>
          </div>

          <div className="sheet-tool-panels" hidden={!toolGroup}>
            <section
              id="tools-data"
              className="sheet-tool-panel"
              hidden={toolGroup !== 'data'}
              aria-label="Add data"
            >
              <p>Import records or find your next accounts and buyers.</p>
              <div className="sheet-tool-buttons">
                <input
                  ref={fileInput}
                  className="file-input"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) importCsv(file);
                    event.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  size="lg"
                  onClick={openSources}
                  disabled={jobLocksWorkspace}
                >
                  <Upload /> Load data
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={openCompanyListBuilder}
                  disabled={jobLocksWorkspace}
                >
                  <Building2 /> Find companies
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={openPeopleListBuilder}
                  disabled={
                    jobLocksWorkspace ||
                    !selected ||
                    (!selected.values.company?.trim() &&
                      !selected.values.domain?.trim())
                  }
                >
                  <Users /> Find people
                </Button>
                <ApiSourceBuilder
                  key={workspace.id}
                  onSave={setWorkspace}
                  workspace={workspace}
                  disabled={jobLocksWorkspace}
                  onImport={(next, count) => {
                    setWorkspace(next);
                    setNotice(
                      `${count} API rows imported. Any active schedule was paused; run recipes when ready.`,
                    );
                  }}
                />
                <WebhookInbox
                  onSaveMapping={(next) => {
                    setWorkspace(next);
                    setNotice('Webhook source mapping updated.');
                  }}
                  workspace={workspace}
                  disabled={jobLocksWorkspace}
                  onImport={(next, count) => {
                    setWorkspace(next);
                    setNotice(
                      `${count} webhook rows imported. Any active schedule was paused; run recipes when ready.`,
                    );
                  }}
                />
              </div>
            </section>
            <section
              id="tools-enrich"
              className="sheet-tool-panel"
              hidden={toolGroup !== 'enrich'}
              aria-label="Enrich"
            >
              <p>Add the information you need, one column at a time.</p>
              <div className="sheet-tool-buttons">
                <Button
                  variant="outline"
                  disabled={jobLocksWorkspace}
                  onClick={() => openProviderCatalog()}
                >
                  <Search /> Provider catalog
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openProviderWaterfall()}
                  disabled={jobLocksWorkspace}
                >
                  <Workflow /> Email & phone waterfall
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openProviderCatalog('research')}
                  disabled={jobLocksWorkspace}
                >
                  <Globe2 /> AI research
                </Button>
                <Button
                  variant="outline"
                  onClick={openColumnPicker}
                  disabled={jobLocksWorkspace}
                >
                  <Library /> Recipe library
                </Button>
              </div>
            </section>
            <section
              id="tools-automate"
              className="sheet-tool-panel"
              hidden={toolGroup !== 'automate'}
              aria-label="Automate"
            >
              <p>Combine steps, track changes, and choose when work runs.</p>
              <div className="sheet-tool-buttons">
                <RecipeFunctionBuilder
                  key={workspace.id}
                  workspace={workspace}
                  ready={canLeaveTable}
                  onSave={setWorkspace}
                  onAdd={(added) => {
                    setWorkspace((current) => ({
                      ...current,
                      columns: [
                        ...current.columns.filter((c) => c.kind !== 'status'),
                        ...added,
                        ...current.columns.filter((c) => c.kind === 'status'),
                      ],
                      schedule:
                        added.some(isExternalRecipe) &&
                        current.schedule?.enabled
                          ? pauseRecipeSchedule(current.schedule)
                          : current.schedule,
                      updatedAt: Date.now(),
                    }));
                    setNotice(
                      'Function columns added. Review and run the function when ready.',
                    );
                  }}
                  onRun={(ids, background) => {
                    if (background)
                      void queueBackgroundRun(undefined, false, ids);
                    else void runEnrichment(undefined, false, ids);
                  }}
                />
                <ChangeSignals
                  key={`signals-${workspace.id}`}
                  workspace={workspace}
                  ready={canLeaveTable}
                  onSave={setWorkspace}
                  onOpenRow={(id) => onOpenTable(workspace.id, id)}
                />
                <Button
                  variant="outline"
                  onClick={() => setRecipeSettingsOpen(true)}
                  disabled={jobLocksWorkspace}
                >
                  <SlidersHorizontal /> Run rules
                </Button>
                <Button
                  variant="outline"
                  onClick={openScheduleBuilder}
                  disabled={jobLocksWorkspace || recipeCount === 0}
                >
                  <CalendarClock /> Schedule
                </Button>
              </div>
            </section>
            <section
              id="tools-send"
              className="sheet-tool-panel"
              hidden={toolGroup !== 'send'}
              aria-label="Send"
            >
              <p>
                Move reviewed records into your CRM, another sheet, or a CSV.
              </p>
              <div className="sheet-tool-buttons">
                <CrmSyncBuilder
                  key={workspace.id}
                  onSave={setWorkspace}
                  workspace={workspace}
                  rowIds={runTargetIds}
                  ready={canLeaveTable && !jobLocksWorkspace}
                />
                <TableTransferBuilder
                  source={workspace}
                  saved={canLeaveTable}
                  selectedRowIds={selectedRowIds}
                  onSave={setWorkspace}
                />
                <Button variant="outline" onClick={exportCsv}>
                  <Download /> Export CSV
                </Button>
              </div>
            </section>
          </div>
          <div className="sheet-viewbar">
            <div className="sheet-view-controls">
              <Button
                variant="ghost"
                onClick={sortRows}
                disabled={jobLocksWorkspace}
              >
                <ArrowDownUp /> Sort
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant={
                        filter === 'All' && !activeSavedView
                          ? 'ghost'
                          : 'secondary'
                      }
                      aria-label="Filter rows"
                    />
                  }
                >
                  <Filter />
                  {activeSavedView?.name ??
                    (filter === 'All' ? 'Filter' : filter)}
                  <ChevronDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="row-filter-menu" align="start">
                  <DropdownMenuRadioGroup
                    value={
                      activeSavedView
                        ? `view:${activeSavedView.id}`
                        : `status:${filter}`
                    }
                    onValueChange={(value) => {
                      setSelectedRowIds([]);
                      if (value.startsWith('view:')) {
                        setFilter('All');
                        setActiveSavedViewId(value.slice(5));
                      } else {
                        setFilter(value.slice(7));
                        setActiveSavedViewId('');
                      }
                    }}
                  >
                    <DropdownMenuRadioItem closeOnClick value="status:All">
                      All statuses
                    </DropdownMenuRadioItem>
                    {[
                      ...new Set([
                        'Ready',
                        'Review',
                        ...workspace.rows
                          .map((row) => row.values.status)
                          .filter(Boolean),
                      ]),
                    ]
                      .filter((status) => status !== 'All')
                      .map((status) => (
                        <DropdownMenuRadioItem
                          closeOnClick
                          key={status}
                          value={`status:${status}`}
                        >
                          {status}
                        </DropdownMenuRadioItem>
                      ))}
                    {workspace.savedViews?.length ? (
                      <DropdownMenuSeparator />
                    ) : null}
                    {(workspace.savedViews ?? []).map((view) => (
                      <DropdownMenuRadioItem
                        closeOnClick
                        key={view.id}
                        value={`view:${view.id}`}
                      >
                        <BookmarkPlus />
                        {view.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={openSavedViewBuilder}
                    disabled={jobLocksWorkspace}
                  >
                    <Plus />
                    Create a saved filter…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <label className="toolbar-search">
                <Search />
                <input
                  value={query}
                  onChange={(event) => {
                    setSelectedRowIds([]);
                    setQuery(event.target.value);
                  }}
                  placeholder="Search rows"
                  aria-label="Search rows"
                />
              </label>
              {query || filter !== 'All' || activeSavedViewId ? (
                <Button variant="ghost" size="sm" onClick={clearView}>
                  <X /> Clear filters
                </Button>
              ) : null}
            </div>
            <div className="sheet-view-actions">
              <ColumnFinder
                onSettings={openColumnEditor}
                columns={workspace.columns}
                disabled={jobLocksWorkspace}
                onVisibility={(id, hidden) => {
                  setSelectedRowIds([]);
                  setColumnJump(undefined);
                  setWorkspace((current) =>
                    setWorkspaceColumnHidden(current, id, hidden),
                  );
                }}
                onShowAll={() => {
                  setSelectedRowIds([]);
                  setWorkspace(showAllWorkspaceColumns);
                }}
                onJump={(id) => {
                  if (workspace.columns.find((c) => c.id === id)?.hidden)
                    setSelectedRowIds([]);
                  setWorkspace((current) =>
                    setWorkspaceColumnHidden(current, id, false),
                  );
                  setColumnJump((current) => ({
                    id,
                    revision: (current?.revision ?? 0) + 1,
                  }));
                }}
              />
              <span className="view-row-count">
                {visibleRows.length.toLocaleString()}
                {visibleRows.length !== workspace.rows.length
                  ? ` of ${workspace.rows.length.toLocaleString()}`
                  : ''}{' '}
                {workspace.rows.length === 1 ? 'row' : 'rows'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={openColumnPicker}
                disabled={jobLocksWorkspace}
              >
                <Plus /> Add column
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={
                  compactRows ? 'Use comfortable rows' : 'Use compact rows'
                }
                aria-pressed={compactRows}
                title={compactRows ? 'Comfortable rows' : 'Compact rows'}
                onClick={toggleDensity}
              >
                <AlignJustify />
              </Button>
              <Button
                variant={inspectorOpen ? 'secondary' : 'ghost'}
                size="sm"
                aria-expanded={inspectorOpen}
                aria-controls="record-inspector"
                onClick={() => setInspectorOpen((value) => !value)}
              >
                <PanelRight /> Details
              </Button>
            </div>
          </div>

          <div className="grid-frame">
            <PomadeDataGrid
              key={`${filter}|${query}|${workspace.columns
                .filter((c) => c.hidden)
                .map((c) => c.id)
                .join('|')}|${visibleRows.map((row) => row.id).join('|')}`}
              compact={compactRows}
              columns={gridColumns}
              jumpToColumn={columnJump}
              jumpToRow={rowJump}
              onRowJumped={finishRowJump}
              onColumnJumped={finishColumnJump}
              rows={visibleRows}
              readOnly={jobLocksWorkspace}
              onColumnResize={resizeColumn}
              onColumnsReorder={reorderColumns}
              onColumnMenu={openColumnEditor}
              onAddColumn={openColumnPicker}
              onRowsChange={updateVisibleRows}
              onActiveRowChange={setActiveRowId}
              onSelectedRowIdsChange={updateSelectedRows}
            />
            {!visibleRows.length ? (
              <div className="sheet-empty-state">
                {workspace.rows.length ? (
                  <Search aria-hidden="true" />
                ) : (
                  <Table2 aria-hidden="true" />
                )}
                <h2>
                  {workspace.rows.length
                    ? 'No records match this view'
                    : 'Your next workflow starts here'}
                </h2>
                <p>
                  {workspace.rows.length
                    ? 'Try a different search or clear your filters to see all records.'
                    : 'Import a CSV, connect your CRM, or start with a blank row.'}
                </p>
                <div>
                  {workspace.rows.length ? (
                    <Button variant="outline" onClick={clearView}>
                      Clear filters
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={openSources}
                        disabled={jobLocksWorkspace}
                      >
                        <Upload /> Import records
                      </Button>
                      <Button
                        variant="outline"
                        onClick={addBlankRow}
                        disabled={jobLocksWorkspace}
                      >
                        <Plus /> Add a row
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : null}
            {notice ? (
              <output className="workspace-toast">
                <Info aria-hidden="true" />
                <span>{notice}</span>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => setNotice('')}
                >
                  <X />
                </button>
              </output>
            ) : null}
          </div>

          <footer className="statusbar">
            <span>
              <span
                className={`status-dot ${saveState === 'Offline' ? 'status-dot-warning' : ''}`}
              />{' '}
              {saveState === 'Offline'
                ? 'Save failed — changes are only in this tab'
                : saveState === 'Saving'
                  ? 'Saving your changes…'
                  : 'All changes saved'}
            </span>
            {saveState === 'Offline' ? (
              <button
                type="button"
                onClick={() => setSaveAttempt((attempt) => attempt + 1)}
              >
                Retry save
              </button>
            ) : null}
            <span>
              {workspace.rows.length}{' '}
              {workspace.rows.length === 1 ? 'record' : 'records'} ·{' '}
              {recipeCount} {recipeCount === 1 ? 'recipe' : 'recipes'}
            </span>
            {workspace.schedule?.enabled && workspace.schedule.nextRunAt ? (
              <button type="button" onClick={openScheduleBuilder}>
                <CalendarClock /> Next run{' '}
                {runTime(workspace.schedule.nextRunAt)}
              </button>
            ) : null}
            {currentRunJob && currentRunJob.status !== 'completed' ? (
              <button type="button" onClick={() => setBackgroundRunsOpen(true)}>
                <Cloud /> Background {runJobPercent(currentRunJob)}%
              </button>
            ) : null}
            {savedSource ? (
              <button
                type="button"
                onClick={refreshSavedCrmSource}
                disabled={jobLocksWorkspace || Boolean(sourceLoading)}
              >
                <RefreshCw /> Refresh CRM source
              </button>
            ) : null}
            <span>{workspace.source?.label ?? 'Manual workspace'}</span>
          </footer>
        </section>

        <aside
          className="inspector"
          id="record-inspector"
          hidden={!inspectorOpen}
          aria-label="Record details"
        >
          <div className="inspector-heading">
            <div>
              <p>Active record</p>
              <h2>
                {selected
                  ? selectedValues.company ||
                    selectedValues.person ||
                    'Selected record'
                  : 'No record selected'}
              </h2>
            </div>
            <span
              className={`record-status record-status-${(selectedValues.status || 'draft').toLowerCase()}`}
            >
              {selectedValues.status || 'Draft'}
            </span>
          </div>
          <Button
            className="inspector-close"
            variant="ghost"
            size="icon-sm"
            aria-label="Close record details"
            onClick={() => setInspectorOpen(false)}
          >
            <X />
          </Button>
          {selected ? (
            <>
              <div className="record-avatar">
                {(selectedValues.company || '?').slice(0, 1)}
              </div>
              <div className="record-person">
                <strong>{selectedValues.person || 'No person yet'}</strong>
                <span>{selectedValues.title || 'No title'}</span>
                {selectedValues.domain ? (
                  <a
                    href={`https://${selectedValues.domain}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {selectedValues.domain}
                  </a>
                ) : null}
              </div>
              {selected?.apiSource ? (
                <p>
                  API source: {selected.apiSource.connectionId} · fetched{' '}
                  {new Date(selected.apiSource.fetchedAt).toLocaleString()} ·
                  batch {selected.apiSource.batchId.slice(0, 8)}
                </p>
              ) : null}
              {selected?.webhookSource ? (
                <p className="source-record-link">
                  Webhook: {selected.webhookSource.sourceId} · received{' '}
                  {new Date(selected.webhookSource.receivedAt).toLocaleString()}{' '}
                  · event {selected.webhookSource.eventId.slice(0, 12)}
                </p>
              ) : null}
              {selected?.sourceRecord ? (
                <Button
                  className="source-record-link"
                  variant="outline"
                  disabled={!canLeaveTable}
                  onClick={() =>
                    onOpenTable(
                      selected.sourceRecord!.tableId,
                      selected.sourceRecord!.rowId,
                    )
                  }
                >
                  Source: {selected.sourceRecord.tableName}
                </Button>
              ) : null}
              <div className="record-signals">
                <div>
                  <span>Email</span>
                  <strong>
                    {selectedValues.email || selectedValues.apollo_email
                      ? 'Present'
                      : 'Missing'}
                  </strong>
                </div>
                <div>
                  <span>Domain</span>
                  <strong>
                    {selectedValues.domain ? 'Present' : 'Missing'}
                  </strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{selectedValues.crm_source || 'Grid'}</strong>
                </div>
              </div>
              <button
                className="apollo-action"
                type="button"
                onClick={openApollo}
                disabled={!selected || jobLocksWorkspace}
              >
                <span>
                  <MailCheck />
                </span>
                <div>
                  <strong>Enrich with Apollo</strong>
                  <small>Person match + verified work email</small>
                </div>
                <Sparkles />
              </button>
              <button
                className="research-action"
                type="button"
                onClick={() => openProviderCatalog('research')}
                disabled={jobLocksWorkspace}
              >
                <span>
                  <Globe2 />
                </span>
                <div>
                  <strong>Research with AI</strong>
                  <small>Custom prompt + cited web research</small>
                </div>
                <Sparkles />
              </button>
              <button
                className="research-action"
                type="button"
                onClick={openPeopleListBuilder}
                disabled={
                  jobLocksWorkspace ||
                  !selected ||
                  (!selected.values.company?.trim() &&
                    !selected.values.domain?.trim())
                }
              >
                <span>
                  <Users />
                </span>
                <div>
                  <strong>Find people</strong>
                  <small>Current roles at this company</small>
                </div>
                <Sparkles />
              </button>
              <button
                className="row-run-action"
                type="button"
                onClick={() => selected && runEnrichment([selected.id])}
                disabled={
                  !selected || running || jobLocksWorkspace || recipeCount === 0
                }
              >
                <Play /> Run recipes for this row
              </button>
              <button
                className="row-run-action"
                type="button"
                onClick={openControlTowerHandoff}
                disabled={!selected}
              >
                <ShieldCheck /> Prepare CRM handoff
              </button>
              <div className="inspector-section">
                <div className="section-title">
                  <span>Recipe trace</span>
                  <span>{selectedReceipts.length} recent</span>
                </div>
                {selectedReceipts.length ? (
                  <ol className="recipe-list">
                    {selectedReceipts.map((receipt) => (
                      <li key={receipt.id}>
                        <span
                          className={
                            receipt.status === 'review' ? 'trace-review' : ''
                          }
                        >
                          {receipt.status === 'review' ? <Search /> : <Check />}
                        </span>
                        <div>
                          <strong>{receipt.action}</strong>
                          <small>
                            {receipt.status} · {receipt.durationMs} ms
                          </small>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty-trace">
                    Run this row to see every field-level result and review
                    state.
                  </p>
                )}
              </div>
              <div className="receipt-card">
                <div className="receipt-title">
                  <CirclePlay />
                  <span>Latest run</span>
                  <strong>{latestRun ? 'Complete' : 'Waiting'}</strong>
                </div>
                <p>
                  {latestRun
                    ? `${providerLabel(latestRun)} completed ${latestRun.actionCount} actions across ${latestRun.rowCount} rows${latestRun.skippedCount ? ` and skipped ${latestRun.skippedCount} by rule` : ''}. External writes: ${latestRun.externalWrites}.`
                    : 'Every run records its inputs, outputs, duration, and review state.'}
                </p>
                <button
                  type="button"
                  onClick={() => openRunReceipt(latestRun)}
                  disabled={!latestRun}
                >
                  View run details →
                </button>
              </div>
            </>
          ) : (
            <p className="inspector-empty">
              Select a cell in your sheet to see the record, available actions,
              and its run history.
            </p>
          )}
        </aside>
      </div>

      {exportOpen ? (
        <CsvExportDialog
          workspace={workspace}
          visibleRowIds={visibleRows.map((row) => row.id)}
          selectedRowIds={selectedRowIds}
          onClose={() => setExportOpen(false)}
          onExported={(count) =>
            setNotice(`${count} ${count === 1 ? 'row' : 'rows'} exported.`)
          }
        />
      ) : null}
      {csvFile ? (
        <CsvImportDialog
          file={csvFile}
          workspace={workspace}
          ready={canLeaveTable}
          onClose={() => setCsvFile(undefined)}
          onCreated={onTableCreated}
          onAppend={(next) => {
            setWorkspace(next);
            setActiveRowId(next.rows.at(-1)?.id ?? '');
            setSelectedRowIds([]);
            setFilter('All');
            setActiveSavedViewId('');
            setQuery('');
            setNotice(
              `${next.rows.length - workspace.rows.length} CSV rows added. Existing rows and recipes are unchanged.`,
            );
          }}
        />
      ) : null}
      {catalogCategory ? (
        <ProviderCatalog
          initialCategory={catalogCategory}
          onClose={() => setCatalogCategory(undefined)}
          onSelect={chooseProvider}
          onWaterfall={() => openProviderWaterfall()}
        />
      ) : null}
      {companyProvider ? (
        <ProviderPresetBuilder
          key={companyProvider}
          initialProvider={companyProvider}
          open
          onOpenChange={(open) => {
            if (!open) setCompanyProvider(undefined);
          }}
          workspace={workspace}
          ready={canLeaveTable}
          onAdd={(columns) => {
            setWorkspace((current) => ({
              ...current,
              columns: [
                ...current.columns.filter((c) => c.kind !== 'status'),
                ...columns,
                ...current.columns.filter((c) => c.kind === 'status'),
              ],
              schedule: current.schedule
                ? pauseRecipeSchedule(current.schedule)
                : undefined,
              updatedAt: Date.now(),
            }));
            setNotice('Provider columns added. Review and run when ready.');
          }}
        />
      ) : null}
      <ProviderWaterfallBuilder
        key={providerSelection.revision}
        initialPresetId={providerSelection.id}
        open={providerBuilderOpen}
        onOpenChange={setProviderBuilderOpen}
        workspace={workspace}
        onAdd={(added) => {
          setWorkspace((current) => ({
            ...current,
            columns: [
              ...current.columns.filter((c) => c.kind !== 'status'),
              ...added,
              ...current.columns.filter((c) => c.kind === 'status'),
            ],
            schedule: current.schedule?.enabled
              ? pauseRecipeSchedule(current.schedule)
              : current.schedule,
            updatedAt: Date.now(),
          }));
          setNotice(
            'Provider waterfall added. Any active schedule was paused; confirm the expanded request scope before restarting.',
          );
        }}
      />
      <HttpRecipeBuilder
        open={httpBuilderOpen}
        onOpenChange={setHttpBuilderOpen}
        workspace={workspace}
        onAdd={(addedColumns) => {
          setWorkspace((current) => ({
            ...current,
            columns: [
              ...current.columns.filter((column) => column.kind !== 'status'),
              ...addedColumns,
              ...current.columns.filter((column) => column.kind === 'status'),
            ],
            rows: current.rows.map((row) => ({
              ...row,
              values: {
                ...row.values,
                ...Object.fromEntries(
                  addedColumns.map((column) => [column.id, '']),
                ),
              },
            })),
            schedule: current.schedule?.enabled
              ? pauseRecipeSchedule(current.schedule)
              : current.schedule,
            updatedAt: Date.now(),
          }));
          setNotice(
            'HTTP recipe added. Any existing schedule is paused; confirm its new request scope before restarting.',
          );
        }}
      />
      <TableLookupBuilder
        open={lookupBuilderOpen}
        onOpenChange={setLookupBuilderOpen}
        workspace={workspace}
        onAdd={(addedColumns) => {
          setWorkspace((current) => ({
            ...current,
            columns: [
              ...current.columns.filter((column) => column.kind !== 'status'),
              ...addedColumns,
              ...current.columns.filter((column) => column.kind === 'status'),
            ],
            rows: current.rows.map((row) => ({
              ...row,
              values: {
                ...row.values,
                ...Object.fromEntries(
                  addedColumns.map((column) => [column.id, '']),
                ),
              },
            })),
            updatedAt: Date.now(),
          }));
          setNotice(
            'Lookup added. Run its column to refresh from the source table.',
          );
        }}
      />
      <Dialog
        open={addColumnOpen}
        onOpenChange={(open) => {
          setAddColumnOpen(open);
          if (!open) setRecipeQuery('');
        }}
      >
        <DialogContent className="recipe-dialog">
          <DialogHeader>
            <DialogTitle>What’s the next step?</DialogTitle>
            <DialogDescription>
              Add a field, enrich a contact, or research an account. New columns
              appear at the end of your workflow, before run status.
            </DialogDescription>
          </DialogHeader>
          {singleColumnLimit ? (
            <p className="template-error" role="alert">
              {singleColumnLimit}
            </p>
          ) : null}
          <label className="recipe-library-search">
            <Search aria-hidden="true" />
            <input
              value={recipeQuery}
              onChange={(event) => setRecipeQuery(event.target.value)}
              placeholder="Search recipes, research, or transformations…"
              aria-label="Search recipe library"
            />
          </label>
          <div className="column-type-options">
            <button
              type="button"
              hidden={
                !matchesRecipe(
                  'Data field text number date boolean manual blank',
                )
              }
              disabled={jobLocksWorkspace}
              onClick={() => {
                setAddColumnOpen(false);
                setDataColumnName('');
                setDataColumnType('text');
                setDataColumnError('');
                setDataColumnOpen(true);
              }}
            >
              <Table2 />
              <strong>Data field</strong>
              <span>Text, number, date, or true / false</span>
              <Plus />
            </button>
            <button
              type="button"
              hidden={
                !matchesRecipe(
                  'Email phone mobile enrichment provider waterfall',
                )
              }
              disabled={jobLocksWorkspace}
              onClick={() => {
                openProviderCatalog('email');
              }}
            >
              <MailCheck />
              <strong>Email & phone</strong>
              <span>Find contact details with a provider waterfall</span>
              <Plus />
            </button>
            <button
              type="button"
              hidden={
                !matchesRecipe(
                  'AI research web prompt company account buying signals',
                )
              }
              disabled={jobLocksWorkspace}
              onClick={() => openProviderCatalog('research')}
            >
              <Globe2 />
              <strong>AI research</strong>
              <span>Ask a question and get sourced answers</span>
              <Plus />
            </button>
            <button
              type="button"
              hidden={
                !matchesRecipe('Formula calculate transform custom merge')
              }
              disabled={jobLocksWorkspace}
              onClick={openFormulaBuilder}
            >
              <FunctionSquare />
              <strong>Formula</strong>
              <span>Calculate, combine, or clean your data</span>
              <Plus />
            </button>
          </div>
          <div className="recipe-group-heading recipe-quick-actions">
            <Button
              variant="outline"
              disabled={jobLocksWorkspace}
              onClick={() => {
                setAddColumnOpen(false);
                setLookupBuilderOpen(true);
              }}
            >
              <Search /> Lookup another table
            </Button>
            <Button
              variant="outline"
              disabled={jobLocksWorkspace}
              onClick={() => {
                setAddColumnOpen(false);
                setHttpBuilderOpen(true);
              }}
            >
              <Globe2 /> HTTP API
            </Button>
            <Button
              variant="outline"
              disabled={jobLocksWorkspace}
              onClick={() => {
                setAddColumnOpen(false);
                openProviderWaterfall();
              }}
            >
              Provider waterfall
            </Button>
            <Button
              variant="outline"
              disabled={jobLocksWorkspace}
              onClick={() => recipeFileInput.current?.click()}
            >
              <Upload /> Import recipe file
            </Button>
            <input
              ref={recipeFileInput}
              className="file-input"
              type="file"
              accept=".json,application/json"
              aria-label="Import Pomade recipe"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadRecipeFile(file);
                event.target.value = '';
              }}
            />
          </div>
          <p className="template-no-inputs">
            Recipe files contain configuration and prompts, not table rows.
            Importing does not run a recipe.
          </p>
          {recipeQuery &&
          ![
            ...RESEARCH_RECIPES.map(
              (template) => `${template.name} ${template.description}`,
            ),
            ...recipeTemplates.map(
              (template) => `${template.name} ${template.description ?? ''}`,
            ),
            ...recipePresets.map(
              (preset) =>
                `${preset.title} ${preset.description} ${preset.requires}`,
            ),
            'Data field text number date boolean manual blank',
            'Email phone mobile enrichment provider waterfall',
            'AI research web prompt company account buying signals',
            'Formula calculate transform custom merge',
          ].some((value) => matchesRecipe(value)) ? (
            <div className="recipe-library-empty">
              <Search />
              <strong>No matching recipes</strong>
              <p>
                Try “email”, “hiring”, or “formula”, or create your own research
                step.
              </p>
              <Button variant="outline" onClick={() => setRecipeQuery('')}>
                Clear search
              </Button>
            </div>
          ) : null}
          {recipeFileMessage ? (
            <output className="template-no-inputs">{recipeFileMessage}</output>
          ) : null}
          <section
            className="recipe-group"
            hidden={
              !RESEARCH_RECIPES.some((template) =>
                matchesRecipe(template.name, template.description),
              )
            }
          >
            <div className="recipe-group-heading">
              <span>Buying-signal research</span>
              <small>4 reusable recipes · one research action each</small>
            </div>
            <p className="template-no-inputs">
              Find a reason to reach out. Each recipe adds six columns with
              evidence, sources, and a separate sales hypothesis. Choose a
              provider and run only when ready.
            </p>
            <div className="template-library-list">
              {RESEARCH_RECIPES.filter((template) =>
                matchesRecipe(template.name, template.description),
              ).map((template, index) => (
                <article key={template.id}>
                  <span className="template-library-icon" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <strong>{template.name}</strong>
                    <small>{template.description}</small>
                    <em>Company website → 6 outputs</em>
                  </div>
                  <button
                    className="template-use-button"
                    type="button"
                    disabled={jobLocksWorkspace}
                    onClick={() => openTemplateUse(template)}
                  >
                    Use
                  </button>
                  <button
                    className="template-delete-button"
                    type="button"
                    aria-label={`Export ${template.name}`}
                    title="Export recipe file"
                    onClick={() => downloadRecipe(template)}
                  >
                    <Download />
                  </button>
                </article>
              ))}
            </div>
          </section>
          {recipeTemplates.length ? (
            <section
              className="recipe-group template-library"
              hidden={
                !recipeTemplates.some((template) =>
                  matchesRecipe(template.name, template.description),
                )
              }
            >
              <div className="recipe-group-heading">
                <span>Saved functions</span>
                <small>{recipeTemplates.length} reusable</small>
              </div>
              <div className="template-library-list">
                {recipeTemplates
                  .filter((template) =>
                    matchesRecipe(template.name, template.description),
                  )
                  .map((template) => {
                    const outputCount =
                      template.column.outputFields?.length ?? 1;
                    return (
                      <article key={template.id}>
                        <span className="template-library-icon">
                          <Library />
                        </span>
                        <div>
                          <strong>{template.name}</strong>
                          <small>
                            {template.description ||
                              `${template.column.title} recipe`}
                          </small>
                          <em>
                            {template.inputs.length} input
                            {template.inputs.length === 1 ? '' : 's'} →{' '}
                            {outputCount} output{outputCount === 1 ? '' : 's'}
                            {template.column.outputCardinality === 'list'
                              ? ` · up to ${template.column.listLimit ?? 10} rows`
                              : ''}
                          </em>
                        </div>
                        <button
                          className="template-use-button"
                          type="button"
                          disabled={jobLocksWorkspace}
                          onClick={() => openTemplateUse(template)}
                        >
                          Use
                        </button>
                        <button
                          className="template-delete-button"
                          type="button"
                          aria-label={`Export ${template.name}`}
                          title="Export recipe file"
                          onClick={() => downloadRecipe(template)}
                        >
                          <Download />
                        </button>
                        <button
                          className="template-delete-button"
                          type="button"
                          aria-label={`Delete ${template.name}`}
                          onClick={() => deleteRecipeTemplate(template)}
                        >
                          <Trash2 />
                        </button>
                      </article>
                    );
                  })}
              </div>
            </section>
          ) : null}
          {(['Transform', 'Research'] as const).map((group) => (
            <section
              className="recipe-group"
              key={group}
              hidden={
                !recipePresets.some(
                  (preset) =>
                    preset.group === group &&
                    matchesRecipe(
                      preset.title,
                      preset.description,
                      preset.requires,
                    ),
                )
              }
            >
              <div className="recipe-group-heading">
                <span>{group}</span>
                <small>
                  {group === 'Transform'
                    ? 'Instant, deterministic formulas'
                    : 'Live web research and local demo recipes'}
                </small>
              </div>
              <div className="recipe-presets">
                {recipePresets
                  .filter(
                    (preset) =>
                      preset.group === group &&
                      matchesRecipe(
                        preset.title,
                        preset.description,
                        preset.requires,
                      ),
                  )
                  .map((preset) => (
                    <button
                      key={`${preset.recipe}-${preset.title}`}
                      type="button"
                      disabled={jobLocksWorkspace || Boolean(singleColumnLimit)}
                      onClick={() =>
                        preset.recipe === 'custom-formula'
                          ? openFormulaBuilder()
                          : preset.recipe === 'waterfall'
                            ? openWaterfallBuilder()
                            : preset.recipe === 'write-opener'
                              ? openTemplateUse(PERSONAL_OPENER_RECIPE)
                              : preset.recipe === 'web-research'
                                ? openResearchBuilder()
                                : addRecipeColumn(preset)
                      }
                    >
                      <span
                        className={
                          preset.kind === 'formula'
                            ? 'formula-preset'
                            : 'ai-preset'
                        }
                      >
                        {preset.recipe === 'web-research' ? (
                          <Globe2 />
                        ) : preset.recipe === 'waterfall' ? (
                          <Workflow />
                        ) : preset.kind === 'formula' ? (
                          <FunctionSquare />
                        ) : (
                          <Sparkles />
                        )}
                      </span>
                      <div>
                        <strong>{preset.title}</strong>
                        <small>{preset.description}</small>
                        <em>Uses {preset.requires}</em>
                      </div>
                      <Plus />
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </DialogContent>
      </Dialog>

      <Dialog open={dataColumnOpen} onOpenChange={setDataColumnOpen}>
        <DialogContent className="data-column-dialog">
          <DialogHeader>
            <DialogTitle>Add a data field</DialogTitle>
            <DialogDescription>
              A blank column for values you type, paste, or import.
            </DialogDescription>
          </DialogHeader>
          <form
            className="data-column-form"
            onSubmit={(event) => {
              event.preventDefault();
              addDataColumn();
            }}
          >
            <label>
              Column name
              <input
                value={dataColumnName}
                onChange={(event) => {
                  setDataColumnName(event.target.value);
                  setDataColumnError('');
                }}
                maxLength={80}
                placeholder="e.g. Target region"
                required
              />
            </label>
            <label>
              Value type
              <select
                value={dataColumnType}
                onChange={(event) =>
                  setDataColumnType(event.target.value as ResearchValueType)
                }
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="boolean">True / false</option>
              </select>
            </label>
            {dataColumnError || singleColumnLimit ? (
              <p className="template-error" role="alert">
                {dataColumnError || singleColumnLimit}
              </p>
            ) : null}
            <div className="data-column-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDataColumnOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !dataColumnName.trim() ||
                  jobLocksWorkspace ||
                  Boolean(singleColumnLimit)
                }
              >
                <Plus /> Add column
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={recipeSettingsOpen} onOpenChange={setRecipeSettingsOpen}>
        <DialogContent className="recipe-settings-dialog">
          <DialogHeader>
            <DialogTitle>Recipe run settings</DialogTitle>
            <DialogDescription>
              Choose which rows each recipe may run on. Safe formula columns can
              also update immediately when an input cell changes.
            </DialogDescription>
          </DialogHeader>
          <div className="recipe-settings-summary">
            <div>
              <span>Recipe columns</span>
              <strong>{recipeCount}</strong>
            </div>
            <div>
              <span>Conditional</span>
              <strong>{conditionCount}</strong>
            </div>
            <div>
              <span>Auto-updating</span>
              <strong>{automaticFormulaCount}</strong>
            </div>
          </div>
          {researchStatus?.provider === 'codex' ? (
            <CodexDefaultsEditor state={codexSettings} />
          ) : null}
          <div className="recipe-settings-list">
            {recipeColumns.map((column) => {
              const columnIndex = workspace.columns.findIndex(
                (item) => item.id === column.id,
              );
              const availableInputs = workspace.columns
                .slice(0, columnIndex)
                .filter((item) => item.kind !== 'status');
              const condition = column.runCondition;
              return (
                <article className="recipe-setting" key={column.id}>
                  <div className="recipe-setting-heading">
                    <span
                      className={
                        column.kind === 'formula'
                          ? 'formula-preset'
                          : 'ai-preset'
                      }
                    >
                      {column.recipe === 'waterfall' ? (
                        <Workflow />
                      ) : column.kind === 'formula' ? (
                        <FunctionSquare />
                      ) : (
                        <Sparkles />
                      )}
                    </span>
                    <div>
                      <strong>{column.title}</strong>
                      <small>
                        {column.recipe === 'waterfall'
                          ? `${column.waterfallSteps?.length ?? 0}-step waterfall + lineage`
                          : column.kind === 'formula'
                            ? 'Deterministic formula'
                            : column.recipe === 'web-research'
                              ? column.outputCardinality === 'list'
                                ? `Credit-gated list research · up to ${column.listLimit ?? 10} rows`
                                : 'Credit-gated web research'
                              : 'Manual enrichment'}
                      </small>
                    </div>
                    <div className="recipe-setting-controls">
                      <button
                        type="button"
                        onClick={() => openTemplateSave(column)}
                      >
                        <BookmarkPlus /> Save template
                      </button>
                      {column.kind === 'formula' ? (
                        <label className="auto-update-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(column.autoRun)}
                            onChange={(event) =>
                              updateRecipeColumn(column.id, {
                                autoRun: event.target.checked,
                              })
                            }
                          />
                          <span>Auto-update</span>
                        </label>
                      ) : (
                        <span className="manual-run-badge">Manual run</span>
                      )}
                    </div>
                  </div>
                  {column.recipe === 'web-research' ? (
                    <ResearchProviderPicker
                      value={column.researchProvider}
                      defaultProvider={researchStatus?.provider}
                      disabled={jobLocksWorkspace}
                      onChange={(researchProvider) =>
                        updateRecipeColumn(column.id, { researchProvider })
                      }
                    />
                  ) : null}
                  {column.recipe === 'web-research' &&
                  (column.researchProvider ?? researchStatus?.provider) ===
                    'codex' ? (
                    <CodexModelPicker
                      label={`${column.title} research`}
                      value={column.codexResearch}
                      defaults={codexSettings.data?.defaults}
                      models={codexSettings.data?.models}
                      inherit
                      disabled={jobLocksWorkspace || codexSettings.loading}
                      onChange={(codexResearch) =>
                        updateRecipeColumn(column.id, { codexResearch })
                      }
                    />
                  ) : null}
                  <RunConditionEditor
                    columns={availableInputs}
                    condition={condition}
                    onChange={(runCondition) =>
                      updateRecipeColumn(column.id, { runCondition })
                    }
                    label={`Run ${column.title} only when`}
                  />
                </article>
              );
            })}
          </div>
          <div className="recipe-settings-actions">
            <p>
              Conditions are checked locally before any provider request, so
              skipped research rows do not consume a request.
            </p>
            <Button onClick={() => setRecipeSettingsOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={templateSaveOpen}
        onOpenChange={(open) => {
          setTemplateSaveOpen(open);
          if (!open) setTemplateError('');
        }}
      >
        <DialogContent className="template-dialog">
          <DialogHeader>
            <DialogTitle>Save recipe as a template</DialogTitle>
            <DialogDescription>
              Turn this configured column into a reusable function with named
              inputs and outputs.
            </DialogDescription>
          </DialogHeader>
          {templateColumn ? (
            <div className="template-contract-card">
              <span
                className={
                  templateColumn.kind === 'formula'
                    ? 'formula-preset'
                    : 'ai-preset'
                }
              >
                {templateColumn.recipe === 'waterfall' ? (
                  <Workflow />
                ) : templateColumn.kind === 'formula' ? (
                  <FunctionSquare />
                ) : (
                  <Sparkles />
                )}
              </span>
              <div>
                <strong>{templateColumn.title}</strong>
                <small>
                  {templateColumn.outputFields?.length ?? 1} declared output
                  {(templateColumn.outputFields?.length ?? 1) === 1 ? '' : 's'}
                  {templateColumn.outputCardinality === 'list'
                    ? ` · up to ${templateColumn.listLimit ?? 10} rows per source row`
                    : ''}
                  {templateColumn.runCondition ? ' · condition included' : ''}
                </small>
              </div>
            </div>
          ) : null}
          <label className="research-field">
            <span>Template name</span>
            <input
              value={templateName}
              maxLength={80}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Account trigger research"
            />
          </label>
          <label className="research-field">
            <span>Description</span>
            <textarea
              value={templateDescription}
              maxLength={240}
              onChange={(event) => setTemplateDescription(event.target.value)}
              placeholder="When this recipe is useful"
            />
          </label>
          {templateError ? (
            <p className="template-error" role="alert">
              {templateError}
            </p>
          ) : null}
          <div className="template-dialog-actions">
            <p>
              The saved template keeps the formula, prompt, output types,
              condition, and auto-update setting.
            </p>
            <Button
              variant="outline"
              onClick={() => setTemplateSaveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={saveRecipeTemplate}
              disabled={!templateName.trim()}
            >
              <BookmarkPlus /> Save template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={templateUseOpen}
        onOpenChange={(open) => {
          setTemplateUseOpen(open);
          if (!open) setTemplateError('');
        }}
      >
        <DialogContent className="template-dialog template-use-dialog">
          <DialogHeader>
            <DialogTitle>Use {activeTemplate?.name ?? 'template'}</DialogTitle>
            <DialogDescription>
              Map each declared input to this table. Pomade creates fresh output
              columns and keeps the saved recipe configuration.
            </DialogDescription>
          </DialogHeader>
          {activeTemplate ? (
            <>
              <div className="template-contract-summary">
                <div>
                  <span>Inputs</span>
                  <strong>{activeTemplate.inputs.length}</strong>
                </div>
                <div>
                  <span>Outputs</span>
                  <strong>
                    {activeTemplate.column.outputCardinality === 'list'
                      ? `Up to ${activeTemplate.column.listLimit ?? 10} rows`
                      : (activeTemplate.column.outputFields?.length ?? 1)}
                  </strong>
                </div>
                <div>
                  <span>Runner</span>
                  <strong>
                    {activeTemplate.column.kind === 'formula'
                      ? 'Local'
                      : isExternalRecipe(activeTemplate.column)
                        ? 'Research'
                        : 'Pomade'}
                  </strong>
                </div>
              </div>
              <div className="template-output-list">
                <span>Creates</span>
                <div>
                  {(
                    activeTemplate.column.outputFields ?? [
                      {
                        id: activeTemplate.column.id,
                        title: activeTemplate.column.title,
                        valueType: activeTemplate.column.valueType ?? 'text',
                      },
                    ]
                  ).map((output) => (
                    <span key={output.id}>
                      {output.title} <em>{output.valueType}</em>
                    </span>
                  ))}
                </div>
              </div>
              {activeTemplate.column.recipe === 'web-research' ? (
                <>
                  <ResearchProviderPicker
                    value={templateResearchProvider}
                    defaultProvider={researchStatus?.provider}
                    disabled={jobLocksWorkspace}
                    onChange={setTemplateResearchProvider}
                  />
                  {activeTemplate.id === PERSONAL_OPENER_RECIPE.id ? (
                    <label className="recipe-research-focus">
                      Research prompt
                      <textarea
                        aria-label="Research prompt"
                        aria-describedby="personal-opener-prompt-help"
                        rows={6}
                        maxLength={4000}
                        value={templateResearchPrompt}
                        onChange={(event) =>
                          setTemplateResearchPrompt(event.target.value)
                        }
                      />
                      <small id="personal-opener-prompt-help">
                        Use {'{{domain}}'} for the mapped website. Keep the
                        evidence and insufficient-evidence instructions. Adding
                        this recipe does not run research.
                      </small>
                    </label>
                  ) : null}
                  <label className="recipe-research-focus">
                    Research focus (optional)
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={templateResearchFocus}
                      onChange={(event) =>
                        setTemplateResearchFocus(event.target.value)
                      }
                      placeholder="For example: HubSpot and Salesforce; US SDR roles; funding in the last 90 days"
                    />
                    <small>
                      Saved with this copy. You can edit the full prompt in
                      column settings and save your version as a template.
                    </small>
                  </label>
                </>
              ) : null}
              {activeTemplate.inputs.length ? (
                <div className="template-input-mapping">
                  <div className="structured-field-heading">
                    <span>Input mapping</span>
                    <small>Required fields are marked</small>
                  </div>
                  {activeTemplate.inputs.map((input) => (
                    <label key={input.key}>
                      <span>
                        {input.title}
                        {input.required ? <em>Required</em> : <em>Optional</em>}
                      </span>
                      <select
                        value={templateBindings[input.key] ?? ''}
                        onChange={(event) =>
                          setTemplateBindings((current) => ({
                            ...current,
                            [input.key]: event.target.value,
                          }))
                        }
                      >
                        <option value="">
                          {input.required ? 'Choose a column…' : 'Not mapped'}
                        </option>
                        {workspace.columns
                          .filter((column) => column.kind !== 'status')
                          .map((column) => (
                            <option value={column.id} key={column.id}>
                              {column.title}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="template-no-inputs">
                  This function does not need an input mapping.
                </p>
              )}
            </>
          ) : null}
          {templateError ? (
            <p className="template-error" role="alert">
              {templateError}
            </p>
          ) : null}
          <div className="template-dialog-actions">
            <p>Outputs remain editable and run like any other recipe column.</p>
            <Button variant="outline" onClick={() => setTemplateUseOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={useRecipeTemplate}
              disabled={
                !activeTemplate || !templateBindingsReady || jobLocksWorkspace
              }
            >
              <Plus /> Add function
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={formulaBuilderOpen} onOpenChange={setFormulaBuilderOpen}>
        <DialogContent className="formula-builder-dialog">
          <DialogHeader>
            <DialogTitle>Build a custom formula</DialogTitle>
            <DialogDescription>
              Merge row values into a new column and preview the first five
              results before adding it.
            </DialogDescription>
          </DialogHeader>
          <label className="research-field">
            <span>Output column</span>
            <input
              value={formulaColumnName}
              maxLength={80}
              onChange={(event) => setFormulaColumnName(event.target.value)}
              placeholder="Personal label"
            />
          </label>
          <label className="research-field">
            <span>Formula</span>
            <textarea
              aria-label="Formula"
              value={formulaExpression}
              maxLength={2_000}
              onChange={(event) => setFormulaExpression(event.target.value)}
              placeholder="{{person | first}} at {{company}}"
            />
          </label>
          <div className="formula-help">
            <label className="formula-column-search">
              Find a column to insert
              <input
                type="search"
                value={formulaColumnQuery}
                onChange={(event) => setFormulaColumnQuery(event.target.value)}
                placeholder="Search column names…"
              />
            </label>
            <div
              className="research-variables formula-input-columns"
              aria-label="Available columns"
            >
              {formulaInputColumns.map((column) => (
                <button
                  type="button"
                  key={column.id}
                  onClick={() =>
                    setFormulaExpression(
                      (current) => `${current}{{${column.id}}}`,
                    )
                  }
                >
                  {column.title}
                </button>
              ))}
            </div>
            {!formulaInputColumns.length ? (
              <p>No columns match this search.</p>
            ) : null}
            <p>
              Optional filters: <code>| trim</code>, <code>| lower</code>,{' '}
              <code>| upper</code>, <code>| first</code>, or{' '}
              <code>| domain</code>. Formulas are text-only and never execute
              code.
            </p>
          </div>
          <section className="formula-preview" aria-label="Formula preview">
            <div className="formula-preview-heading">
              <span>Preview</span>
              <small>First {Math.min(5, workspace.rows.length)} rows</small>
            </div>
            {workspace.rows.slice(0, 5).map((row, index) => (
              <div key={row.id}>
                <span>
                  {row.values.company ||
                    row.values.person ||
                    `Row ${index + 1}`}
                </span>
                <strong>
                  {renderCustomFormula(formulaExpression, row) || '—'}
                </strong>
              </div>
            ))}
          </section>
          <div className="research-builder-actions">
            <p>The new column stays editable and runs in column order.</p>
            {singleColumnLimit ? (
              <p className="template-error" role="alert">
                {singleColumnLimit}
              </p>
            ) : null}
            <Button
              variant="outline"
              onClick={() => setFormulaBuilderOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={addCustomFormulaColumn}
              disabled={
                !formulaColumnName.trim() ||
                !formulaExpression.trim() ||
                Boolean(singleColumnLimit)
              }
            >
              <Plus /> Add formula column
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={waterfallBuilderOpen}
        onOpenChange={setWaterfallBuilderOpen}
      >
        <DialogContent className="waterfall-builder-dialog">
          <DialogHeader>
            <DialogTitle>Build a data waterfall</DialogTitle>
            <DialogDescription>
              Check enrichment columns in order, keep the first available value,
              and record which source won.
            </DialogDescription>
          </DialogHeader>
          <label className="research-field">
            <span>Output column</span>
            <input
              value={waterfallColumnName}
              maxLength={80}
              onChange={(event) => setWaterfallColumnName(event.target.value)}
              placeholder="Best work email"
            />
          </label>
          <div className="waterfall-builder">
            <div className="structured-field-heading">
              <span>Fallback order</span>
              <small>First non-empty value wins</small>
            </div>
            <div className="waterfall-step-list">
              {waterfallSteps.map((step, index) => (
                <div key={step.key}>
                  <span>{index + 1}</span>
                  <select
                    value={step.field}
                    aria-label={`Waterfall source ${index + 1}`}
                    onChange={(event) =>
                      setWaterfallSteps((current) =>
                        current.map((candidate) =>
                          candidate.key === step.key
                            ? { ...candidate, field: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                  >
                    <option value="">Choose a source…</option>
                    {workspace.columns
                      .filter((column) => column.kind !== 'status')
                      .map((column) => (
                        <option
                          value={column.id}
                          key={column.id}
                          disabled={waterfallSteps.some(
                            (candidate) =>
                              candidate.key !== step.key &&
                              candidate.field === column.id,
                          )}
                        >
                          {column.title}
                        </option>
                      ))}
                  </select>
                  <div className="waterfall-order-buttons">
                    <button
                      type="button"
                      aria-label={`Move source ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => moveWaterfallStep(index, -1)}
                    >
                      <ArrowUp />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move source ${index + 1} down`}
                      disabled={index === waterfallSteps.length - 1}
                      onClick={() => moveWaterfallStep(index, 1)}
                    >
                      <ArrowDown />
                    </button>
                  </div>
                  <button
                    className="waterfall-remove-button"
                    type="button"
                    aria-label={`Remove source ${index + 1}`}
                    disabled={waterfallSteps.length <= 2}
                    onClick={() =>
                      setWaterfallSteps((current) =>
                        current.filter(
                          (candidate) => candidate.key !== step.key,
                        ),
                      )
                    }
                  >
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="add-structured-field"
              type="button"
              disabled={waterfallSteps.length >= 6}
              onClick={() =>
                setWaterfallSteps((current) => [
                  ...current,
                  { key: crypto.randomUUID(), field: '' },
                ])
              }
            >
              <Plus /> Add fallback
            </button>
          </div>
          <div className="waterfall-output-preview">
            <span>
              <Workflow /> {waterfallColumnName.trim() || 'Value'}
            </span>
            <span>+</span>
            <span>{waterfallColumnName.trim() || 'Value'} source</span>
          </div>
          <div className="research-builder-actions">
            <p>
              Both columns update locally when an upstream result changes; no
              provider request is added.
            </p>
            <Button
              variant="outline"
              onClick={() => setWaterfallBuilderOpen(false)}
            >
              Cancel
            </Button>
            {waterfallColumnLimit ? (
              <p className="template-error" role="alert">
                {waterfallColumnLimit}
              </p>
            ) : null}
            <Button
              onClick={addWaterfallColumn}
              disabled={!waterfallReady || Boolean(waterfallColumnLimit)}
            >
              <Plus /> Add waterfall
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={researchBuilderOpen} onOpenChange={setResearchBuilderOpen}>
        <DialogContent className="research-builder-dialog">
          <DialogHeader>
            <DialogTitle>Add AI web research</DialogTitle>
            <DialogDescription>
              Ask a question for each row, research live websites and keep the
              source links with your answers.
            </DialogDescription>
          </DialogHeader>
          <ResearchProviderPicker
            value={researchBuilderProvider}
            defaultProvider={researchStatus?.provider}
            disabled={jobLocksWorkspace}
            onChange={setResearchBuilderProvider}
          />
          <div className="catalog-list-heading">
            <span>
              {researchStatusLoading
                ? 'Checking connection…'
                : catalogConnectionStatus(
                    PROVIDER_CATALOG.find(
                      (action) =>
                        action.id ===
                        `research-${researchBuilderProvider ?? researchStatus?.provider}`,
                    ) ??
                      PROVIDER_CATALOG.find(
                        (action) => action.id === 'research-parallel',
                      )!,
                    { research: researchStatus },
                  ).label}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={researchStatusLoading}
              onClick={() => setResearchStatusRevision((value) => value + 1)}
            >
              Check connection
            </Button>
          </div>
          {(researchBuilderProvider ?? researchStatus?.provider) === 'codex' ? (
            <>
              <CodexModelPicker
                label="Research settings"
                value={researchModelSettings}
                defaults={codexSettings.data?.defaults}
                models={codexSettings.data?.models}
                inherit
                disabled={codexSettings.loading}
                onChange={setResearchModelSettings}
              />
              <CodexDefaultsEditor state={codexSettings} />
            </>
          ) : null}
          <fieldset className="research-output-shape">
            <legend>Output shape</legend>
            <div>
              <button
                type="button"
                className={researchOutputMode === 'single' ? 'active' : ''}
                aria-pressed={researchOutputMode === 'single'}
                onClick={() => chooseResearchOutputMode('single')}
              >
                <strong>One answer</strong>
                <small>Write the response into one editable column</small>
              </button>
              <button
                type="button"
                className={researchOutputMode === 'structured' ? 'active' : ''}
                aria-pressed={researchOutputMode === 'structured'}
                onClick={() => chooseResearchOutputMode('structured')}
              >
                <strong>Structured fields</strong>
                <small>Split one request across typed columns</small>
              </button>
              <button
                type="button"
                className={researchOutputMode === 'list' ? 'active' : ''}
                aria-pressed={researchOutputMode === 'list'}
                onClick={() => chooseResearchOutputMode('list')}
              >
                <strong>List into rows</strong>
                <small>Create one child row for every found item</small>
              </button>
            </div>
          </fieldset>
          {researchOutputMode === 'single' ? (
            <label className="research-field">
              <span>Output column</span>
              <input
                value={researchColumnName}
                maxLength={80}
                onChange={(event) => setResearchColumnName(event.target.value)}
                placeholder="Recent company trigger"
              />
            </label>
          ) : (
            <div className="structured-field-builder">
              <div className="structured-field-heading">
                <span>
                  {researchOutputMode === 'list'
                    ? 'Fields per result'
                    : 'Output columns'}
                </span>
                <small>{researchFields.length}/6 fields</small>
              </div>
              <div className="structured-field-list">
                {researchFields.map((field, index) => (
                  <div key={field.key}>
                    <span>{index + 1}</span>
                    <input
                      value={field.title}
                      maxLength={80}
                      aria-label={`Output field ${index + 1} name`}
                      placeholder="Field name"
                      onChange={(event) =>
                        setResearchFields((current) =>
                          current.map((item) =>
                            item.key === field.key
                              ? { ...item, title: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <select
                      value={field.valueType}
                      aria-label={`Output field ${index + 1} type`}
                      onChange={(event) =>
                        setResearchFields((current) =>
                          current.map((item) =>
                            item.key === field.key
                              ? {
                                  ...item,
                                  valueType: event.target
                                    .value as ResearchValueType,
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="text">Text</option>
                      <option value="date">Date</option>
                      <option value="number">Number</option>
                      <option value="boolean">Yes / no</option>
                    </select>
                    <button
                      type="button"
                      aria-label={`Remove ${field.title || `field ${index + 1}`}`}
                      disabled={
                        researchFields.length <=
                        (researchOutputMode === 'list' ? 1 : 2)
                      }
                      onClick={() =>
                        setResearchFields((current) =>
                          current.filter((item) => item.key !== field.key),
                        )
                      }
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="add-structured-field"
                type="button"
                disabled={researchFields.length >= 6}
                onClick={() =>
                  setResearchFields((current) => [
                    ...current,
                    {
                      key: crypto.randomUUID(),
                      title: '',
                      valueType: 'text',
                    },
                  ])
                }
              >
                <Plus /> Add output field
              </button>
              {researchOutputMode === 'list' ? (
                <label className="list-result-limit">
                  <span>
                    Maximum results <small>1–25 rows per source row</small>
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={researchListLimit}
                    onChange={(event) =>
                      setResearchListLimit(
                        Math.min(
                          25,
                          Math.max(1, Number(event.target.value) || 1),
                        ),
                      )
                    }
                  />
                </label>
              ) : null}
            </div>
          )}
          <label className="research-field">
            <span>Research prompt</span>
            <textarea
              aria-label="Research prompt"
              value={researchPrompt}
              maxLength={4_000}
              onChange={(event) => setResearchPrompt(event.target.value)}
            />
          </label>
          <div className="research-variables" aria-label="Available variables">
            <span>Available variables</span>
            <code>{'{{company}}'}</code>
            <code>{'{{domain}}'}</code>
            <code>{'{{person}}'}</code>
            <code>{'{{title}}'}</code>
          </div>
          <div className="research-builder-actions">
            <p>
              {researchOutputMode === 'structured'
                ? `One provider request fills ${researchFields.length} columns. Malformed results stay visible and require review.`
                : researchOutputMode === 'list'
                  ? `One request may create up to ${researchListLimit} child rows. Rerunning replaces this recipe's earlier children instead of duplicating them.`
                  : 'Answers and citations are saved with each research receipt.'}
            </p>
            <Button
              variant="outline"
              onClick={() => setResearchBuilderOpen(false)}
            >
              Cancel
            </Button>
            {researchColumnLimit ? (
              <p className="template-error" role="alert">
                {researchColumnLimit}
              </p>
            ) : null}
            <Button
              onClick={addWebResearchColumn}
              disabled={
                !researchOutputReady ||
                !researchPrompt.trim() ||
                Boolean(researchColumnLimit)
              }
            >
              <Plus />
              {researchOutputMode === 'structured'
                ? 'Add structured research'
                : researchOutputMode === 'list'
                  ? 'Add list research'
                  : 'Add research column'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={companyListOpen} onOpenChange={setCompanyListOpen}>
        <DialogContent className="company-list-dialog">
          <DialogHeader>
            <DialogTitle>Find target companies</DialogTitle>
            <DialogDescription>
              Describe your ideal companies and Pomade will research a bounded,
              evidence-backed list directly into this table.
            </DialogDescription>
          </DialogHeader>
          <ResearchConnectionStatus
            status={researchStatus}
            checking={researchStatusLoading}
            onRefresh={() => setResearchStatusRevision((value) => value + 1)}
            title="ICP company finder"
          />
          <label className="research-field">
            <span>Ideal customer profile</span>
            <textarea
              value={icpBrief}
              maxLength={2_000}
              onChange={(event) => setIcpBrief(event.target.value)}
              placeholder="Who should Pomade find? Include market, geography, size, signals, and exclusions."
            />
          </label>
          <label className="list-result-limit company-list-limit">
            <span>
              Maximum results <small>1–25 companies</small>
            </span>
            <input
              type="number"
              min={1}
              max={25}
              value={icpListLimit}
              onChange={(event) =>
                setIcpListLimit(
                  Math.min(25, Math.max(1, Number(event.target.value) || 1)),
                )
              }
            />
          </label>
          <div className="company-list-outputs">
            <span>Company</span>
            <span>Domain</span>
            <span>Fit reason</span>
            <span>Employees</span>
            <span>Headquarters</span>
          </div>
          <p className="research-safety">
            Your existing rows stay in place. Pomade adds one reusable research
            recipe and one source row, then asks you to confirm the provider
            request before anything runs.
            {workspace.schedule?.enabled
              ? ' The active schedule will pause until you approve its new provider scope.'
              : ''}
          </p>
          {pendingWebResearchColumns.some(hasAsyncProvider) && (
            <p className="research-safety">
              These providers return results later. Pomade saves each request ID
              and waits before trying fallback providers. FullEnrich checks are
              spaced five minutes apart; Enrow checks use shorter intervals.
              FullEnrich reports enrichment credits with its results. After 30
              minutes of waiting, use Resume to check the same request.
            </p>
          )}
          <div className="research-confirm-actions">
            <Button variant="outline" onClick={() => setCompanyListOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createCompanyList} disabled={!icpListReady}>
              <Globe2 /> Continue to research
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={peopleListOpen} onOpenChange={setPeopleListOpen}>
        <DialogContent className="company-list-dialog">
          <DialogHeader>
            <DialogTitle>Find people at this company</DialogTitle>
            <DialogDescription>
              Research current public business profiles at the active company,
              then add evidence-linked people as child rows.
            </DialogDescription>
          </DialogHeader>
          <ResearchConnectionStatus
            status={researchStatus}
            checking={researchStatusLoading}
            onRefresh={() => setResearchStatusRevision((value) => value + 1)}
            title={selectedValues.company || selectedValues.domain || 'Company'}
            detail={`${selectedValues.domain || 'No domain'} · ${researchStatus?.label ?? 'AI web research'}`}
          />
          <label className="research-field">
            <span>Roles and seniority</span>
            <textarea
              value={peopleBrief}
              maxLength={2_000}
              onChange={(event) => setPeopleBrief(event.target.value)}
              placeholder="Who should Pomade find? Include functions, titles, seniority, geography, and exclusions."
            />
          </label>
          <label className="list-result-limit company-list-limit">
            <span>
              Maximum results <small>1–25 people</small>
            </span>
            <input
              type="number"
              min={1}
              max={25}
              value={peopleListLimit}
              onChange={(event) =>
                setPeopleListLimit(
                  Math.min(25, Math.max(1, Number(event.target.value) || 1)),
                )
              }
            />
          </label>
          <div className="company-list-outputs">
            <span>Person</span>
            <span>Title</span>
            <span>LinkedIn</span>
            <span>Role match</span>
            <span>Location</span>
          </div>
          <p className="research-safety">
            Pomade keeps the company row, adds one reusable list recipe, and
            asks for provider confirmation before research. It returns public
            role evidence only—use Apollo afterward for eligible work-email
            enrichment.
            {workspace.schedule?.enabled
              ? ' The active schedule will pause until you approve its new provider scope.'
              : ''}
          </p>
          <div className="research-confirm-actions">
            <Button variant="outline" onClick={() => setPeopleListOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createPeopleList} disabled={!peopleListReady}>
              <Globe2 /> Continue to research
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={researchConfirmOpen}
        onOpenChange={(open) => {
          setResearchConfirmOpen(open);
          if (!open) {
            setPendingRunRowIds([]);
            setPendingRunColumnIds([]);
            setPendingRunMode('immediate');
          }
        }}
      >
        <DialogContent className="research-confirm-dialog">
          <DialogHeader>
            <DialogTitle>
              {effectiveRunMode === 'background'
                ? 'Review background run'
                : 'Review recipe run'}
            </DialogTitle>
            <DialogDescription>
              {pendingResearchActionCount > 0
                ? 'Selected providers receive configured row values. Requests may consume provider credits; review the scope before running.'
                : 'Only local recipes are selected. These run inside Pomade without provider requests.'}
              {effectiveRunMode === 'background' &&
                (deployment.hosted
                  ? ' Hosted runs advance while Pomade is open or its companion is connected. ChatGPT research also needs the Mac research helper.'
                  : ' Background jobs continue while Pomade’s local server is running.')}
            </DialogDescription>
          </DialogHeader>
          {pendingWebResearchColumns.some(
            (column) => column.recipe === 'web-research',
          ) ? (
            <ResearchConnectionStatus
              status={researchStatus}
              checking={researchStatusLoading}
              onRefresh={() => setResearchStatusRevision((value) => value + 1)}
            />
          ) : null}
          <RunScopePicker
            columns={recipeColumns}
            rows={pendingRows}
            selectedIds={pendingRunColumnIds}
            onChange={setPendingRunColumnIds}
            mode={effectiveRunMode}
            onModeChange={setPendingRunMode}
            requiresBackground={pendingRequiresBackground}
          />
          <div className="research-run-summary">
            <div>
              <span>Rows</span>
              <strong>{pendingRunRowIds.length}</strong>
            </div>
            <div>
              <span>External recipe columns</span>
              <strong>{pendingWebResearchColumns.length}</strong>
            </div>
            <div>
              <span>
                {pendingWebResearchColumns.some(hasAsyncProvider)
                  ? 'Maximum provider submissions'
                  : 'Maximum requests'}
              </span>
              <strong>{pendingResearchActionCount}</strong>
            </div>
            <div>
              <span>Possible new rows</span>
              <strong>{pendingListRowLimit}</strong>
            </div>
          </div>
          <RunPreview
            workspace={workspace}
            rowIds={pendingRunRowIds}
            columnIds={pendingRunColumnIds}
            research={researchStatus}
          />
          {pendingWebResearchColumns.some(hasAsyncProvider) && (
            <p className="research-safety">
              Background providers save each request ID and wait for its result
              before continuing the waterfall. Resume checks that saved request
              without submitting it again.
            </p>
          )}
          {pendingBudgetIssue ? (
            <div className="research-warning" role="alert">
              <p>{pendingBudgetIssue}</p>
              {effectiveRunMode === 'immediate' &&
                pendingBudget.backgroundAllowed && (
                  <Button
                    variant="outline"
                    onClick={() => setPendingRunMode('background')}
                  >
                    Use background
                  </Button>
                )}
            </div>
          ) : null}
          <div className="research-confirm-actions">
            <Button
              variant="outline"
              onClick={() => setResearchConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const rowIds = pendingRunRowIds;
                const columnIds = pendingRunColumnIds;
                const mode = effectiveRunMode;
                setResearchConfirmOpen(false);
                setPendingRunRowIds([]);
                setPendingRunColumnIds([]);
                setPendingRunMode('immediate');
                if (mode === 'background') {
                  void queueBackgroundRun(
                    rowIds,
                    pendingResearchActionCount > 0,
                    columnIds,
                  );
                } else {
                  void runEnrichment(
                    rowIds,
                    pendingResearchActionCount > 0,
                    columnIds,
                  );
                }
              }}
              disabled={
                (pendingWebResearchColumns.some(
                  (column) => column.recipe === 'web-research',
                ) &&
                  (researchStatusLoading ||
                    pendingWebResearchColumns.some(
                      (c) =>
                        c.recipe === 'web-research' &&
                        !(
                          researchStatus?.alternatives?.find(
                            (p) =>
                              p.provider ===
                              (c.researchProvider ?? researchStatus?.provider),
                          )?.configured ?? researchStatus?.configured
                        ),
                    ))) ||
                Boolean(pendingBudgetIssue) ||
                jobSaving
              }
            >
              <Globe2 />
              {effectiveRunMode === 'background'
                ? `Queue ${pendingRunRowIds.length} ${pendingRunRowIds.length === 1 ? 'row' : 'rows'}`
                : `Run ${pendingRunRowIds.length} ${pendingRunRowIds.length === 1 ? 'row' : 'rows'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={backgroundRunsOpen} onOpenChange={setBackgroundRunsOpen}>
        <DialogContent className="background-runs-dialog">
          <DialogHeader>
            <DialogTitle>Background runs</DialogTitle>
            <DialogDescription>
              Saved runs keep completed steps and wait for provider results.
              Processing continues while the local server and clock, or the
              hosted worker and its wakeups, are running.
            </DialogDescription>
          </DialogHeader>
          {runJobs.length ? (
            <div className="run-job-list">
              {runJobs.slice(0, 6).map((job) => {
                const processed = job.completedCount + job.skippedCount;
                const finishSchedule =
                  job.id === workspace.schedule?.jobId &&
                  job.status === 'completed' &&
                  ['failed', 'paused'].includes(
                    workspace.schedule?.state ?? '',
                  );
                return (
                  <article
                    key={job.id}
                    className={`run-job run-job-${job.status}`}
                  >
                    <div className="run-job-heading">
                      <span className="run-job-icon">
                        {job.status === 'running' ? (
                          <LoaderCircle className="spin" />
                        ) : job.status === 'completed' ? (
                          <Check />
                        ) : job.status === 'failed' ? (
                          <RotateCcw />
                        ) : job.status === 'paused' ? (
                          <Pause />
                        ) : (
                          <Cloud />
                        )}
                      </span>
                      <div>
                        <strong>{job.rowIds.length} row background run</strong>
                        <small>
                          {processed} processed ·{' '}
                          {job.waitingMessage && job.status === 'queued'
                            ? 'Waiting for result'
                            : job.status}
                          {job.confirmExternalResearch
                            ? ' · provider consent saved'
                            : ' · local recipes only'}
                        </small>
                      </div>
                      <em>{runJobPercent(job)}%</em>
                    </div>
                    <progress
                      className="run-job-progress"
                      aria-label={`Background run ${runJobPercent(job)} percent complete`}
                      max={100}
                      value={runJobPercent(job)}
                    />
                    {job.waitingMessage ? (
                      <p className="run-job-waiting">
                        {job.waitingMessage}
                        {job.nextCheckAt
                          ? ` Next result check no earlier than ${runTime(job.nextCheckAt)}.`
                          : ''}
                      </p>
                    ) : null}
                    {job.lastError ||
                    (finishSchedule && workspace.schedule?.lastError) ? (
                      <p className="run-job-error">
                        {job.lastError || workspace.schedule?.lastError}
                      </p>
                    ) : null}
                    {canPauseRunJob(job) ||
                    canResumeRunJob(job) ||
                    finishSchedule ? (
                      <div className="run-job-actions">
                        <span>
                          {job.skippedCount
                            ? `${job.skippedCount} deleted ${job.skippedCount === 1 ? 'row was' : 'rows were'} skipped.`
                            : 'Resume reuses saved steps and request IDs. Cancel, then start a new run for fresh lookups. A request already in flight may finish.'}
                        </span>
                        {canPauseRunJob(job) ? (
                          <Button
                            variant="outline"
                            onClick={() => void updateRunJob(job, 'pause')}
                            disabled={jobSaving}
                          >
                            <Pause /> Pause
                          </Button>
                        ) : (
                          <Button
                            onClick={() => void updateRunJob(job, 'resume')}
                            disabled={jobSaving}
                          >
                            <Play />{' '}
                            {finishSchedule
                              ? 'Finish scheduled steps'
                              : 'Resume saved run'}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          disabled={jobSaving}
                          onClick={() => void updateRunJob(job, 'cancel')}
                        >
                          Cancel run
                        </Button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="empty-trace">
              No background runs yet. Choose **Action → Run in background** to
              queue the current row scope.
            </p>
          )}
          {jobError ? (
            <p className="apollo-error" role="alert">
              {jobError}
            </p>
          ) : null}
          <div className="background-runs-footer">
            <p>
              The worker advances one row per job each minute and resumes from
              the last completed row after a failure.
            </p>
            <Button
              variant="outline"
              onClick={() => setBackgroundRunsOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={scheduleOpen}
        onOpenChange={(open) => {
          setScheduleOpen(open);
          if (!open) setScheduleError('');
        }}
      >
        <DialogContent className="schedule-dialog">
          <DialogHeader>
            <DialogTitle>Schedule recipe runs</DialogTitle>
            <DialogDescription>
              Run this table once later or refresh it on a deliberate recurring
              interval. The local Worker and clock must keep running when the
              browser is closed.
            </DialogDescription>
          </DialogHeader>
          {workspace.schedule ? (
            <div
              className={`schedule-current schedule-current-${workspace.schedule.state}`}
            >
              <CalendarClock />
              <div>
                <strong>
                  {workspace.schedule.state === 'failed'
                    ? 'Schedule stopped after an error'
                    : workspace.schedule.state === 'running'
                      ? 'Scheduled run in progress'
                      : workspace.schedule.enabled &&
                          workspace.schedule.nextRunAt
                        ? `${cadenceLabel(workspace.schedule.cadence)} · next ${runTime(workspace.schedule.nextRunAt)}`
                        : workspace.schedule.state === 'complete'
                          ? 'One-time run complete'
                          : 'Schedule paused'}
                </strong>
                <small>
                  {workspace.schedule.lastError ||
                    (workspace.schedule.lastRunAt
                      ? `Last completed ${runTime(workspace.schedule.lastRunAt)}`
                      : 'No scheduled run has completed yet')}
                </small>
              </div>
            </div>
          ) : null}
          <label>
            <input
              type="checkbox"
              checked={scheduleSourceEnabled}
              disabled={!workspace.apiSourceRefresh}
              onChange={(e) => {
                setScheduleSourceEnabled(e.target.checked);
                setScheduleSourceConfirmed(false);
                setScheduleConfirmsResearch(false);
                if (e.target.checked) setScheduleTarget('all');
              }}
            />
            Refresh saved API source before recipes
          </label>
          {scheduleSourceEnabled && workspace.apiSourceRefresh ? (
            <label>
              <input
                type="checkbox"
                checked={scheduleSourceConfirmed}
                onChange={(e) => setScheduleSourceConfirmed(e.target.checked)}
              />
              Allow up to{' '}
              {workspace.apiSourceRefresh.config.pagination === 'none'
                ? 1
                : workspace.apiSourceRefresh.config.maxPages}{' '}
              source requests per run to{' '}
              {workspace.apiSourceRefresh.config.connectionId}
              {workspace.apiSourceRefresh.config.path}, importing at most{' '}
              {workspace.apiSourceRefresh.config.maxRows} records. Mapped
              values, including blanks, replace existing inputs. All table rows
              then run. Incomplete fetches stop the workflow. API costs and
              remote effects depend on this connection.
            </label>
          ) : (
            <p>
              Save a complete API fetch and mapping in Import from API to
              configure a source refresh.
            </p>
          )}
          <div className="schedule-fields">
            <label>
              <span>Cadence</span>
              <select
                value={scheduleCadence}
                onChange={(event) =>
                  setScheduleCadence(
                    event.target.value as RecipeScheduleCadence,
                  )
                }
              >
                <option value="once">One time</option>
                <option value="every_day">Every 24 hours</option>
                <option value="every_week">Every 7 days</option>
              </select>
            </label>
            <label>
              <span>{scheduleCadence === 'once' ? 'Run at' : 'First run'}</span>
              <input
                type="datetime-local"
                value={scheduleRunAt}
                min={dateTimeInputValue(scheduleNow + 60_000)}
                onChange={(event) => setScheduleRunAt(event.target.value)}
              />
            </label>
          </div>
          <div className="schedule-fields">
            <label>
              Recipe scope
              <select
                value={scheduleFunctionId}
                onChange={(e) => {
                  setScheduleFunctionId(e.target.value);
                  setScheduleConfirmsResearch(false);
                }}
              >
                <option value="">All recipe columns</option>
                {scheduleFunctions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
                {scheduleFunctionId &&
                !scheduleFunctions.some((f) => f.id === scheduleFunctionId) ? (
                  <option value={scheduleFunctionId}>Missing function</option>
                ) : null}
              </select>
            </label>
            <fieldset>
              <legend>After a successful run</legend>
              {(workspace.tableTransfers ?? []).map((rule) => (
                <label key={rule.id}>
                  <input
                    type="checkbox"
                    checked={scheduleTransferIds.includes(rule.id)}
                    onChange={(e) =>
                      setScheduleTransferIds((ids) =>
                        e.target.checked
                          ? [...ids, rule.id]
                          : ids.filter((id) => id !== rule.id),
                      )
                    }
                  />
                  {rule.name}
                </label>
              ))}
              {scheduleTransferIds
                .filter(
                  (id) => !workspace.tableTransfers?.some((r) => r.id === id),
                )
                .map((id) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked
                      onChange={() =>
                        setScheduleTransferIds((ids) =>
                          ids.filter((i) => i !== id),
                        )
                      }
                    />
                    Missing rule: {id}
                  </label>
                ))}
            </fieldset>
          </div>
          <fieldset>
            <legend>Write to CRM after the recipes finish</legend>
            {(workspace.crmMappings ?? []).map((mapping) => (
              <label key={mapping.id}>
                <input
                  type="checkbox"
                  checked={scheduleCrmIds.includes(mapping.id)}
                  onChange={(e) => {
                    setScheduleCrmIds((ids) =>
                      e.target.checked
                        ? [...ids, mapping.id]
                        : ids.filter((id) => id !== mapping.id),
                    );
                    setScheduleCrmConfirmed(false);
                  }}
                />
                {mapping.name}
              </label>
            ))}
            {scheduleCrmIds
              .filter(
                (id) =>
                  !workspace.crmMappings?.some((mapping) => mapping.id === id),
              )
              .map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked
                    onChange={() => {
                      setScheduleCrmIds((ids) =>
                        ids.filter((value) => value !== id),
                      );
                      setScheduleCrmConfirmed(false);
                    }}
                  />
                  Removed mapping: {id} — uncheck to detach it from this
                  schedule
                </label>
              ))}
            {!workspace.crmMappings?.length ? (
              <p>Save a mapping in Write to CRM first.</p>
            ) : null}
            {scheduleCrmIds.length ? (
              <>
                <RunConditionEditor
                  columns={workspace.columns.filter((c) => c.kind !== 'status')}
                  condition={scheduleCrmCondition}
                  onChange={(condition) => {
                    setScheduleCrmCondition(condition);
                    setScheduleCrmConfirmed(false);
                  }}
                  label="Write qualifying rows only when"
                />
                <label>
                  <input
                    type="checkbox"
                    checked={scheduleCrmConfirmed}
                    onChange={(e) => setScheduleCrmConfirmed(e.target.checked)}
                  />
                  Allow these saved CRM writes after each scheduled run. Up to
                  25 qualifying rows per destination. Property updates can
                  trigger existing CRM workflows.
                </label>
                <p>
                  The schedule captures these mappings. Later mapping edits take
                  effect after you save the schedule again. Batches that fail
                  verification stop for review.
                </p>
              </>
            ) : null}
          </fieldset>
          {scheduleScopeError ? <p role="alert">{scheduleScopeError}</p> : null}
          {scheduleHasUnfinishedRun ? (
            <p>
              A saved scheduled run is unfinished. Resume or cancel it before
              saving a replacement.{' '}
              <Button
                variant="outline"
                onClick={() => {
                  setScheduleOpen(false);
                  setBackgroundRunsOpen(true);
                }}
              >
                Manage saved run
              </Button>
            </p>
          ) : null}
          {scheduleTransferIds.length ? (
            <p>
              Choose up to five rules with different destinations. Each branch
              uses its own condition and source/child-row scope. Matching rows
              can go to several destinations. All branches commit together; a
              failed branch stops all destination changes. Saved rules are
              copied when you save this schedule. Preview them in Transfer rows
              first.
            </p>
          ) : null}
          <fieldset className="research-output-shape schedule-target-shape">
            <legend>Rows to run</legend>
            <div>
              <button
                type="button"
                className={scheduleTarget === 'all' ? 'active' : ''}
                aria-pressed={scheduleTarget === 'all'}
                onClick={() => setScheduleTarget('all')}
              >
                <strong>Whole table</strong>
                <small>{workspace.rows.length} current rows</small>
              </button>
              <button
                type="button"
                className={scheduleTarget === 'selected' ? 'active' : ''}
                aria-pressed={scheduleTarget === 'selected'}
                disabled={scheduleSourceEnabled || !scheduleRowIds.length}
                onClick={() => setScheduleTarget('selected')}
              >
                <strong>Captured selection</strong>
                <small>{scheduleRowIds.length} stable row IDs</small>
              </button>
            </div>
          </fieldset>
          {scheduledExternalColumns.length ? (
            <div className="schedule-provider-confirmation">
              <input
                id="schedule-provider-consent"
                type="checkbox"
                checked={scheduleConfirmsResearch}
                onChange={(event) =>
                  setScheduleConfirmsResearch(event.target.checked)
                }
              />
              <label htmlFor="schedule-provider-consent">
                <strong>Allow scheduled provider requests</strong>
                <small>
                  This scope currently makes up to{' '}
                  {scheduledResearchActionCount} external requests per run.
                  Research may use cached results; HTTP requests are sent each
                  time.
                </small>
              </label>
            </div>
          ) : (
            <p className="schedule-local-note">
              This table currently runs local formulas and deterministic
              enrichments only.
            </p>
          )}
          {scheduledResearchActionCount > MAX_BACKGROUND_RESEARCH_ACTIONS ? (
            <p className="schedule-error" role="alert">
              This scope allows up to {scheduledResearchActionCount} external
              requests. Choose a captured selection so each run stays at or
              below {MAX_BACKGROUND_RESEARCH_ACTIONS} provider submissions,
              including verifications.
            </p>
          ) : scheduleError ? (
            <p className="schedule-error" role="alert">
              {scheduleError}
            </p>
          ) : null}
          <div className="schedule-actions">
            <p>
              Delayed results keep this run waiting. Transfers and CRM writes
              start after enrichment finishes. Resume a stopped run from
              Background runs.
            </p>
            {workspace.schedule?.enabled ||
            workspace.schedule?.state === 'running' ? (
              <Button variant="outline" onClick={pauseSchedule}>
                <Pause /> Pause
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveRecipeSchedule} disabled={!scheduleReady}>
              <CalendarClock /> Save schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={receiptOpen}
        onOpenChange={(open) => {
          setReceiptOpen(open);
          if (!open) setReceiptRun(undefined);
        }}
      >
        <DialogContent className="receipt-dialog">
          <DialogHeader>
            <DialogTitle>Run receipt</DialogTitle>
            <DialogDescription>
              {currentReceipt
                ? `${providerLabel(currentReceipt)} · ${runTime(currentReceipt.finishedAt)} · ${currentReceipt.passedCount} passed · ${currentReceipt.reviewCount} rows need review`
                : 'No run yet.'}
            </DialogDescription>
          </DialogHeader>
          <div className="receipt-summary">
            <div>
              <span>Rows</span>
              <strong>{currentReceipt?.rowCount ?? 0}</strong>
            </div>
            <div>
              <span>Actions</span>
              <strong>{currentReceipt?.actionCount ?? 0}</strong>
            </div>
            <div>
              <span>Skipped by rules</span>
              <strong>{currentReceipt?.skippedCount ?? 0}</strong>
            </div>
            <div>
              <span>External writes</span>
              <strong>{currentReceipt?.externalWrites ?? 0}</strong>
            </div>
          </div>
          <div className="receipt-controls">
            <input
              aria-label="Search run receipt"
              placeholder="Find a company, action, or error…"
              value={receiptQuery}
              onChange={(event) => {
                setReceiptQuery(event.target.value);
                setReceiptPage(0);
              }}
            />
            <select
              aria-label="Receipt status"
              value={receiptStatus}
              onChange={(event) => {
                setReceiptStatus(event.target.value);
                setReceiptPage(0);
              }}
            >
              <option value="all">All results</option>
              <option value="review">Needs review</option>
              <option value="passed">Passed</option>
            </select>
            {receiptQuery || receiptStatus !== 'all' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReceiptQuery('');
                  setReceiptStatus('all');
                  setReceiptPage(0);
                }}
              >
                Clear receipt filters
              </Button>
            ) : null}
          </div>
          <div
            className="receipt-log"
            key={`${currentReceipt?.id}-${receiptPage}`}
          >
            {filteredReceipts
              .slice(receiptPage * 100, (receiptPage + 1) * 100)
              .map((receipt) => (
                <div key={receipt.id}>
                  <span
                    className={
                      receipt.status === 'passed'
                        ? 'receipt-pass'
                        : 'receipt-review'
                    }
                  >
                    {receipt.status === 'passed' ? <Check /> : <Search />}
                  </span>
                  <div>
                    <strong>
                      {receipt.rowLabel} · {receipt.action}
                    </strong>
                    <small>
                      {receipt.after || 'No output'} · {receipt.durationMs} ms
                    </small>
                    {receipt.researchModel ? (
                      <small>
                        Research: {receipt.researchModel}
                        {receipt.reasoningEffort
                          ? ` · ${receipt.reasoningEffort} effort`
                          : ''}
                        {receipt.cached ? ' · cached result' : ''}
                      </small>
                    ) : null}
                    {receipt.error ? (
                      <p className="receipt-error">{receipt.error}</p>
                    ) : null}
                    {receipt.evidence?.length && !receipt.attempts?.length ? (
                      <details>
                        <summary>Result details</summary>
                        <ul>
                          {receipt.evidence.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    {receipt.attempts?.length ? (
                      <details>
                        <summary>
                          {receipt.attempts.length} provider attempts
                        </summary>
                        {receipt.attempts.map((attempt) => (
                          <div className="receipt-attempt" key={attempt.id}>
                            <p>
                              {attempt.action} ·{' '}
                              {attempt.pending
                                ? 'waiting for result'
                                : attempt.status === 'passed'
                                  ? 'accepted'
                                  : attempt.error
                                    ? 'provider error'
                                    : 'not accepted'}{' '}
                              ·{' '}
                              {attempt.error ||
                                (attempt.pending
                                  ? 'Search in progress'
                                  : attempt.after) ||
                                'No result'}{' '}
                              · {attempt.durationMs} ms ·{' '}
                              {attempt.creditsConsumed == null
                                ? 'cost unknown'
                                : `${attempt.creditsConsumed} credits`}
                              {attempt.cached ? ' · saved step reused' : ''}
                              {attempt.httpRequestCount !== undefined
                                ? ` · ${attempt.httpRequestCount} HTTP request${attempt.httpRequestCount === 1 ? '' : 's'} this pass`
                                : ''}
                            </p>
                            {attempt.evidence?.length ? (
                              <ul>
                                {attempt.evidence.map((item, detailIndex) => (
                                  <li key={detailIndex}>{item}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ))}
                      </details>
                    ) : null}
                    {receipt.references?.length ? (
                      <span className="receipt-sources">
                        {receipt.references
                          .slice(0, 3)
                          .map((reference, index) => (
                            <a
                              key={`${reference.url}-${index}`}
                              href={reference.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {reference.title}
                            </a>
                          ))}
                      </span>
                    ) : null}
                    {receipt.browserVisits?.length ? (
                      <details>
                        <summary>
                          Browser visits · {receipt.browserVisits.length}
                        </summary>
                        {receipt.browserVisits.map((visit, index) => (
                          <p key={`${visit.url}-${index}`}>
                            {visit.status} ·{' '}
                            <a
                              href={visit.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {visit.title || visit.url}
                            </a>
                            {visit.error ? ` · ${visit.error}` : ''}
                            {visit.truncated
                              ? ' · Page text was shortened'
                              : ''}
                            {' · '}
                            {new Date(visit.visitedAt).toLocaleString()}
                          </p>
                        ))}
                        {receipt.references
                          ?.filter((reference) => reference.excerpt)
                          .map((reference, index) => (
                            <figure
                              className="receipt-quotation"
                              key={`${reference.url}-${index}`}
                            >
                              <blockquote>{reference.excerpt}</blockquote>
                              <figcaption>
                                <a
                                  href={reference.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {reference.title || reference.url}
                                </a>
                              </figcaption>
                            </figure>
                          ))}
                      </details>
                    ) : null}
                    {receipt.outputValues &&
                    Object.keys(receipt.outputValues).length > 1 ? (
                      <span className="receipt-output-values">
                        {Object.entries(receipt.outputValues)
                          .slice(0, 6)
                          .map(([columnId, value]) => (
                            <span key={columnId}>
                              <em>
                                {workspace.columns.find(
                                  (column) => column.id === columnId,
                                )?.title ?? columnId.replaceAll('_', ' ')}
                              </em>
                              {value || 'Not found'}
                            </span>
                          ))}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            {!filteredReceipts.length ? (
              <p className="receipt-empty">
                {currentReceipt?.receipts.length
                  ? 'No matching actions. Try another search or clear the filters.'
                  : 'No action details recorded.'}
              </p>
            ) : null}
          </div>
          <div className="receipt-pagination">
            <span aria-live="polite">
              {filteredReceipts.length
                ? `${receiptPage * 100 + 1}–${Math.min((receiptPage + 1) * 100, filteredReceipts.length)} of ${filteredReceipts.length} actions${receiptQuery || receiptStatus !== 'all' ? ` · ${currentReceipt?.receipts.length ?? 0} total` : ''}`
                : '0 matching actions'}
            </span>
            <Button
              variant="outline"
              aria-label="Previous page"
              disabled={receiptPage === 0}
              onClick={() => setReceiptPage((page) => Math.max(0, page - 1))}
            >
              <ChevronLeft /> Previous
            </Button>
            <Button
              variant="outline"
              aria-label="Next page"
              disabled={(receiptPage + 1) * 100 >= filteredReceipts.length}
              onClick={() => setReceiptPage((page) => page + 1)}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="history-dialog">
          <DialogHeader>
            <DialogTitle>Run history</DialogTitle>
            <DialogDescription>
              The latest ten immutable receipts for this workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="history-load-status">
            {historyError ? (
              <p role="alert">{historyError}</p>
            ) : (
              <p>
                {historyLoading
                  ? 'Loading run history…'
                  : 'Receipts saved with this sheet.'}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={historyLoading}
              onClick={() => {
                setHistoryLoading(true);
                setHistoryError('');
                setHistoryRevision((value) => value + 1);
              }}
            >
              {historyError ? 'Retry run history' : 'Refresh run history'}
            </Button>
          </div>
          <div className="usage-summary">
            <div>
              <span>Total actions</span>
              <strong>{recentUsage.actionCount}</strong>
              <small>
                {recentUsage.providerActionCount} provider attempts ·{' '}
                {recentUsage.localActionCount} local
              </small>
            </div>
            <div>
              <span>Observed credits</span>
              <strong>{recentUsage.observedCredits}</strong>
              <small>Provider-reported only</small>
            </div>
            <div>
              <span>Cache hits</span>
              <strong>{recentUsage.cachedProviderActionCount}</strong>
              <small>Provider calls avoided</small>
            </div>
            <div>
              <span>Cost unknown</span>
              <strong>{recentUsage.unreportedProviderActionCount}</strong>
              <small>Actions without credit data</small>
            </div>
          </div>
          <p className="usage-provider-mix">
            Provider mix:{' '}
            {Object.entries(recentUsage.providerActions)
              .map(([provider, count]) => `${provider} ${count}`)
              .join(' · ') || 'none'}
            . Recent receipts only—not a billing ledger.
          </p>
          <ProviderPerformancePanel
            key={workspaceId}
            workspaceId={workspace.id}
            open={historyOpen}
          />
          <div className="run-history-list">
            {runHistory.length ? (
              runHistory.map((run) => (
                <button
                  type="button"
                  key={run.id}
                  onClick={() => {
                    setHistoryOpen(false);
                    openRunReceipt(run);
                  }}
                >
                  <span className="run-provider-icon">
                    {run.provider === 'apollo' ? (
                      <MailCheck />
                    ) : run.provider === 'gemini' ||
                      run.provider === 'parallel' ||
                      run.provider === 'codex' ||
                      run.provider === 'mixed' ? (
                      <Globe2 />
                    ) : (
                      <WandSparkles />
                    )}
                  </span>
                  <span>
                    <strong>{providerLabel(run)}</strong>
                    <small>{runTime(run.finishedAt)}</small>
                  </span>
                  <span className="run-history-metrics">
                    {run.rowCount} rows · {run.actionCount} actions ·{' '}
                    {run.reviewCount} review
                    {run.skippedCount ? ` · ${run.skippedCount} skipped` : ''}
                  </span>
                  <ChevronDown className="history-arrow" />
                </button>
              ))
            ) : (
              <div className="history-empty">
                <History />
                <strong>
                  {historyLoading
                    ? 'Loading receipts…'
                    : historyError
                      ? 'Receipts are temporarily unavailable'
                      : 'No runs yet'}
                </strong>
                <span>
                  {historyError
                    ? 'Retry above. Your saved rows and recipes remain available.'
                    : historyLoading
                      ? 'Your sheet is ready while receipts load.'
                      : 'Add a recipe column and run the grid to create the first receipt.'}
                </span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="version-history-dialog">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              Restore one of the latest 20 structural snapshots. The current
              table is saved first, and any restored schedule stays paused.
            </DialogDescription>
          </DialogHeader>
          <div className="version-history-body">
            {!canLeaveTable && !restoringVersionId ? (
              <p className="versions-error">
                Finish saving your changes before restoring. Close this dialog
                and use Retry save if needed.
              </p>
            ) : null}
            {versionsError ? (
              <p className="versions-error">{versionsError}</p>
            ) : null}
            <div className="version-history-list">
              {versionsLoading ? (
                <div className="history-empty">
                  <LoaderCircle className="spin" />
                  <strong>Loading versions…</strong>
                </div>
              ) : workspaceVersions.length ? (
                workspaceVersions.map((version) => (
                  <article key={version.id}>
                    <span className="version-icon">
                      <History />
                    </span>
                    <span>
                      <strong>{runTime(version.createdAt)}</strong>
                      <small>Saved before {version.reason.toLowerCase()}</small>
                    </span>
                    <span className="version-metrics">
                      {version.rowCount} rows · {version.columnCount} columns
                      {version.sourceLabel ? ` · ${version.sourceLabel}` : ''}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => void restoreWorkspaceVersion(version)}
                      disabled={Boolean(restoringVersionId) || !canLeaveTable}
                    >
                      {restoringVersionId === version.id ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        <RotateCcw />
                      )}
                      Restore
                    </Button>
                  </article>
                ))
              ) : (
                <div className="history-empty">
                  <History />
                  <strong>No earlier versions yet</strong>
                  <span>
                    Pomade creates a recoverable snapshot before the next saved
                    grid change or enrichment run.
                  </span>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sourcesOpen}
        onOpenChange={(open) => {
          setSourcesOpen(open);
          if (!open) {
            sourceRequest.current?.abort();
            setSourceLoading(undefined);
            setSourcePreview(undefined);
            setSourceError('');
          }
        }}
      >
        <DialogContent className="sources-dialog">
          <DialogHeader>
            <DialogTitle>Load data</DialogTitle>
            <DialogDescription>
              Preview a CSV or choose contacts, companies, accounts or leads
              from your CRM. Nothing changes until you import.
            </DialogDescription>
          </DialogHeader>
          <ProviderAccounts active={sourcesOpen} />
          {savedSource ? (
            <section className="saved-crm-source">
              <div>
                <strong>{workspace.source?.label}</strong>
                <p className="source-help">
                  Last imported{' '}
                  {new Date(workspace.source!.importedAt).toLocaleString()}.{' '}
                  Uses the saved record type, segment and extra properties.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={refreshSavedCrmSource}
                disabled={
                  jobLocksWorkspace ||
                  Boolean(sourceLoading) ||
                  !crmCatalog.providers[savedSource.provider].configured
                }
              >
                <RefreshCw /> Preview latest
              </Button>
            </section>
          ) : null}
          <div className="source-grid">
            <article className="source-card">
              <span className="source-logo source-logo-csv">
                <FileSpreadsheet />
              </span>
              <div>
                <strong>CSV file</strong>
                <small>Any spreadsheet export</small>
              </div>
              <span className="connection-badge connection-ready">Ready</span>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={jobLocksWorkspace || Boolean(sourceLoading)}
              >
                Choose file
              </button>
            </article>
            {(['hubspot', 'salesforce'] as const).map((provider) => {
              const status = crmCatalog.providers[provider];
              const loading = sourceLoading === provider;
              return (
                <article className="source-card" key={provider}>
                  <span className={`source-logo source-logo-${provider}`}>
                    {provider === 'hubspot' ? <Building2 /> : <Cloud />}
                  </span>
                  <div>
                    <strong>
                      {provider === 'hubspot' ? 'HubSpot' : 'Salesforce'}
                    </strong>
                    <select
                      aria-label={`${provider} object to import`}
                      value={sourceObjects[provider]}
                      disabled={Boolean(sourceLoading)}
                      onChange={(e) => {
                        setSourceObjects({
                          ...sourceObjects,
                          [provider]: e.target.value,
                        });
                        if (provider === 'hubspot') setHubSpotSegmentId('');
                        setSourcePreview(undefined);
                      }}
                    >
                      {(provider === 'hubspot'
                        ? ['contact', 'company']
                        : ['lead', 'contact', 'account']
                      ).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  {provider === 'hubspot' ? (
                    <HubSpotSegmentPicker
                      objectType={sourceObjects.hubspot}
                      value={hubSpotSegmentId}
                      active={sourcesOpen && status.configured}
                      disabled={Boolean(sourceLoading)}
                      onChange={(id) => {
                        setHubSpotSegmentId(id);
                        setSourcePreview(undefined);
                        setSourceError('');
                      }}
                    />
                  ) : null}
                  <label>
                    Extra CRM properties (optional)
                    <input
                      aria-label={`${provider} extra properties`}
                      value={sourceFields[provider]}
                      disabled={Boolean(sourceLoading)}
                      placeholder={
                        provider === 'hubspot'
                          ? 'pomade_icp_score, pomade_signal_tags'
                          : 'Pomade_ICP_Score__c, Pomade_Signal_Tags__c'
                      }
                      onChange={(e) => {
                        setSourceFields({
                          ...sourceFields,
                          [provider]: e.target.value,
                        });
                        setSourcePreview(undefined);
                      }}
                    />
                  </label>
                  <span
                    className={`connection-badge ${status.configured ? 'connection-ready' : ''}`}
                  >
                    {status.configured ? 'Connected' : 'Not configured'}
                  </span>
                  <button
                    type="button"
                    onClick={() => previewCrmSource(provider)}
                    disabled={
                      !status.configured ||
                      Boolean(sourceLoading) ||
                      (provider === 'hubspot' && !hubSpotSegmentId)
                    }
                  >
                    {loading ? (
                      <LoaderCircle className="spin" />
                    ) : (
                      <RefreshCw />
                    )}
                    {loading ? 'Reading…' : 'Preview up to 100'}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="enrichment-connection">
            <span className="source-logo source-logo-apollo">
              <MailCheck />
            </span>
            <div>
              <strong>Apollo enrichment</strong>
              <small>Selected-row person match and verified work email</small>
            </div>
            <span
              className={`connection-badge ${apolloStatus?.configured ? 'connection-ready' : ''}`}
            >
              {apolloStatus?.configured ? 'Connected' : 'Not configured'}
            </span>
          </div>

          <ResearchConnectionStatus
            status={researchStatus}
            checking={researchStatusLoading}
            onRefresh={() => setResearchStatusRevision((value) => value + 1)}
          />

          {researchStatus?.provider === 'codex' ? (
            <CodexDefaultsEditor state={codexSettings} />
          ) : null}
          {sourceError ? (
            <p className="source-error" role="alert">
              {sourceError}
            </p>
          ) : null}

          {sourcePreview ? (
            <section className="source-preview">
              <div className="source-preview-heading">
                <div>
                  <span>Preview</span>
                  <strong>{sourcePreview.sourceLabel}</strong>
                </div>
                <small>
                  {sourcePreview.contacts.length} records · read-only ·{' '}
                  {new Date(sourcePreview.readAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </small>
              </div>
              <div className="source-preview-table">
                <div className="source-preview-row source-preview-header">
                  <span>Person</span>
                  <span>Company</span>
                  <span>Email</span>
                </div>
                {sourcePreview.contacts.slice(0, 5).map((contact) => (
                  <div className="source-preview-row" key={contact.nativeId}>
                    <span>
                      {contact.fullName || contact.company || 'Unnamed record'}
                    </span>
                    <span>{contact.company || '—'}</span>
                    <span>{contact.email || '—'}</span>
                  </div>
                ))}
              </div>
              {!sourcePreview.contacts.length ? (
                <p className="source-help">
                  No matching records in this{' '}
                  {sourcePreview.segment ? 'segment' : 'CRM preview'}. Save this
                  source to refresh it later as records arrive. Existing rows
                  stay in place.
                </p>
              ) : null}
              {sourcePreview.truncated ? (
                <div className="source-pagination">
                  <p className="source-help">
                    {sourcePreview.contacts.length} records loaded. More records
                    are available
                    {sourcePreview.segment ? ' in this segment' : ' in the CRM'}
                    .
                  </p>
                  {sourcePreview.nextAfter ? (
                    <Button
                      variant="outline"
                      disabled={
                        Boolean(sourceLoading) ||
                        sourcePreview.contacts.length >= 5_000
                      }
                      onClick={() =>
                        void previewCrmSource(
                          sourcePreview.provider,
                          sourcePreview.nextAfter,
                        )
                      }
                    >
                      {sourceLoading ? 'Loading…' : 'Load next 100'}
                    </Button>
                  ) : null}
                  {sourcePreview.contacts.length >= 5_000 ? (
                    <p className="source-help">
                      This table has reached its 5,000-row capacity. Use a
                      smaller HubSpot segment for another table.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {importReview ? <CrmImportReview review={importReview} /> : null}
              <div className="source-preview-actions">
                <p>
                  Merge updates CRM fields and adds new records by CRM record
                  ID. Replace swaps the rows but keeps your recipe columns.
                </p>
                <Button
                  variant="outline"
                  onClick={() => importCrmPreview('replace')}
                  disabled={
                    jobLocksWorkspace ||
                    Boolean(sourceLoading) ||
                    !sourcePreview.contacts.length
                  }
                >
                  Replace rows
                </Button>
                <Button
                  onClick={() => importCrmPreview('append')}
                  disabled={jobLocksWorkspace || Boolean(sourceLoading)}
                >
                  {sourcePreview.contacts.length
                    ? 'Merge records'
                    : 'Save source for refresh'}
                </Button>
              </div>
            </section>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={columnEditorOpen} onOpenChange={setColumnEditorOpen}>
        <DialogContent className="rename-dialog column-editor-dialog">
          <DialogHeader>
            <DialogTitle>Column settings</DialogTitle>
            <DialogDescription>
              {editedColumn?.recipe === 'web-research'
                ? 'Update the research question and provider. Your columns and existing results stay in place.'
                : editedColumn?.providerWaterfall
                  ? 'Change which provider is tried first. Your columns, input mappings, and existing results stay in place.'
                  : 'Rename the header while keeping its recipe ID and row data.'}
            </DialogDescription>
          </DialogHeader>
          {editedColumn?.recipe === 'write-opener' ? (
            <div className="template-no-inputs legacy-opener-notice">
              <p>
                Legacy template opener: this column inserts generic text and
                does not research company facts. Its saved values and behavior
                stay unchanged.
              </p>
              <Button
                variant="outline"
                disabled={jobLocksWorkspace}
                onClick={() => {
                  setColumnEditorOpen(false);
                  openTemplateUse(PERSONAL_OPENER_RECIPE);
                }}
              >
                Add researched opener
              </Button>
              <p>
                The researched recipe creates separate columns and only runs
                when you choose.
              </p>
            </div>
          ) : null}
          {editedColumn?.recipe === 'web-research' ? (
            <ResearchProviderPicker
              value={columnEditorProvider}
              defaultProvider={researchStatus?.provider}
              disabled={jobLocksWorkspace}
              onChange={setColumnEditorProvider}
            />
          ) : null}
          {editedColumn?.recipe === 'web-research' &&
          (columnEditorProvider ?? researchStatus?.provider) === 'codex' ? (
            <>
              <CodexModelPicker
                label={`${editedColumn.title} research`}
                value={columnEditorModel}
                defaults={codexSettings.data?.defaults}
                models={codexSettings.data?.models}
                inherit
                disabled={jobLocksWorkspace || codexSettings.loading}
                onChange={setColumnEditorModel}
              />
              <div className="codex-settings-actions">
                <Button
                  variant="outline"
                  disabled={codexSettings.loading || jobLocksWorkspace}
                  onClick={codexSettings.refresh}
                >
                  <RefreshCw />
                  {codexSettings.loading ? 'Loading models…' : 'Refresh models'}
                </Button>
              </div>
              {codexSettings.data?.error ? (
                <p className="source-error" role="alert">
                  {codexSettings.data.error}
                </p>
              ) : null}
            </>
          ) : null}
          <div className="column-editor-meta">
            <span>
              <small>Stable ID</small>
              <code>{editedColumn?.id ?? '—'}</code>
            </span>
            <span>
              <small>Type</small>
              <strong>{editedColumn?.kind ?? '—'}</strong>
            </span>
            <span>
              <small>Width</small>
              <strong>{editedColumn?.width ?? 0}px</strong>
            </span>
          </div>
          <label className="rename-field">
            <span>Column name</span>
            <input
              value={columnEditorTitle}
              disabled={jobLocksWorkspace}
              maxLength={80}
              onChange={(event) => setColumnEditorTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') renameColumn();
              }}
            />
          </label>
          {editedColumn?.recipe === 'web-research' ? (
            <label className="research-field">
              <span>Research prompt</span>
              <textarea
                value={columnEditorPrompt}
                maxLength={4000}
                rows={6}
                disabled={jobLocksWorkspace}
                onChange={(event) => setColumnEditorPrompt(event.target.value)}
              />
              <small>
                Use {'{{column_id}}'} for row values. Existing output fields and
                linked sheets stay the same. Changes apply on the next run.
              </small>
              {researchEditorDirty && workspace.schedule?.enabled ? (
                <small>
                  Saving these changes pauses the schedule so you can review the
                  updated research before it runs automatically.
                </small>
              ) : null}
            </label>
          ) : null}
          {editedColumn?.providerWaterfall ? (
            <div className="column-waterfall-settings">
              <div>
                <strong>Provider order</strong>
                <p>
                  Stop when a provider returns a result that meets the current
                  rule:{' '}
                  {editedColumn.providerWaterfall.accept.replaceAll('-', ' ')}.
                </p>
              </div>
              <ol>
                {columnEditorStepOrder.map((stepIndex, position) => {
                  const step = editedColumn.providerWaterfall!.steps[stepIndex];
                  if (!step) return null;
                  return (
                    <li key={stepIndex}>
                      <span className="waterfall-step-number">
                        {position + 1}
                      </span>
                      <span className="waterfall-step-label">
                        <strong>
                          {step.connectionId
                            .replaceAll('_', ' ')
                            .replaceAll('-', ' ')}
                        </strong>
                        <small>
                          {step.method} · {step.responsePath}
                          {step.verifier ? ' · with verification' : ''}
                        </small>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move provider ${position + 1} up`}
                        disabled={
                          position === 0 ||
                          jobLocksWorkspace ||
                          Boolean(waterfallWaitingJob)
                        }
                        onClick={() =>
                          setColumnEditorStepOrder((order) => {
                            const next = [...order];
                            [next[position - 1], next[position]] = [
                              next[position],
                              next[position - 1],
                            ];
                            return next;
                          })
                        }
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move provider ${position + 1} down`}
                        disabled={
                          position === columnEditorStepOrder.length - 1 ||
                          jobLocksWorkspace ||
                          Boolean(waterfallWaitingJob)
                        }
                        onClick={() =>
                          setColumnEditorStepOrder((order) => {
                            const next = [...order];
                            [next[position], next[position + 1]] = [
                              next[position + 1],
                              next[position],
                            ];
                            return next;
                          })
                        }
                      >
                        <ArrowDown />
                      </Button>
                    </li>
                  );
                })}
              </ol>
              <label className="waterfall-error-choice">
                <input
                  type="checkbox"
                  checked={columnEditorContinueOnError}
                  disabled={jobLocksWorkspace || Boolean(waterfallWaitingJob)}
                  onChange={(event) =>
                    setColumnEditorContinueOnError(event.target.checked)
                  }
                />
                Try the next provider if one returns an error
              </label>
              {waterfallWaitingJob ? (
                <p>
                  A paused or failed run still uses this waterfall. Finish or
                  cancel it before changing provider order.{' '}
                  <Button
                    variant="link"
                    onClick={() => {
                      setColumnEditorOpen(false);
                      setBackgroundRunsOpen(true);
                    }}
                  >
                    Open background runs
                  </Button>
                </p>
              ) : waterfallEditorDirty && workspace.schedule?.enabled ? (
                <p>
                  Saving this order pauses the schedule for review before its
                  next automatic run.
                </p>
              ) : null}
            </div>
          ) : null}
          {columnEditorError ? (
            <p className="apollo-error" role="alert">
              {columnEditorError}
            </p>
          ) : null}
          <p className="column-editor-note">
            Drag the header to reorder it or resize its edge directly in the
            grid. Recipe order and the status column remain protected. An unused
            column can also be deleted with its row values.
          </p>
          {editedColumnDependencies.length ? (
            <div className="column-dependency-warning">
              <strong>Used elsewhere</strong>
              <span>Remove these references before deleting the column:</span>
              <ul>
                {editedColumnDependencies.map((dependency) => (
                  <li key={`${dependency.ownerId}-${dependency.relationship}`}>
                    {dependency.ownerTitle} · {dependency.relationship}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {editedColumn &&
          (editedColumn.kind === 'formula' ||
            editedColumn.kind === 'enrichment') ? (
            <div className="column-editor-run">
              <span>
                <strong>Run only this recipe</strong>
                <small>
                  {recipeEditorDirty
                    ? 'Save settings before running this recipe.'
                    : `${runTargetIds.length} selected or visible rows · provider confirmation applies`}
                </small>
              </span>
              <Button
                variant="outline"
                onClick={() => runEditedColumn('background')}
                disabled={
                  jobSaving ||
                  jobLocksWorkspace ||
                  recipeEditorDirty ||
                  !runTargetIds.length
                }
              >
                <Cloud /> Queue
              </Button>
              <Button
                onClick={() => runEditedColumn('immediate')}
                disabled={
                  running ||
                  jobLocksWorkspace ||
                  recipeEditorDirty ||
                  !runTargetIds.length
                }
              >
                <Play /> Run now
              </Button>
            </div>
          ) : null}
          <div className="rename-actions">
            <Button
              className="column-delete-button"
              variant="destructive"
              onClick={deleteColumn}
              disabled={
                editedColumn?.kind === 'status' ||
                Boolean(editedColumnDependencies.length) ||
                jobLocksWorkspace
              }
            >
              <Trash2 /> Delete column
            </Button>
            <Button
              variant="outline"
              onClick={() => setColumnEditorOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={renameColumn}
              disabled={
                jobLocksWorkspace ||
                (waterfallEditorDirty && Boolean(waterfallWaitingJob)) ||
                !columnEditorTitle.trim() ||
                (editedColumn?.recipe === 'web-research' &&
                  !columnEditorPrompt.trim())
              }
            >
              {editedColumn?.recipe === 'web-research' ||
              editedColumn?.providerWaterfall
                ? 'Save settings'
                : 'Save name'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={savedViewOpen} onOpenChange={setSavedViewOpen}>
        <DialogContent className="saved-view-dialog">
          <DialogHeader>
            <DialogTitle>Save a filtered view</DialogTitle>
            <DialogDescription>
              Pin a reusable one-column filter to this workspace. Search text
              stays temporary and is not included.
            </DialogDescription>
          </DialogHeader>
          <div className="saved-view-fields">
            <label className="research-field">
              <span>View name</span>
              <input
                value={savedViewName}
                maxLength={60}
                onChange={(event) => setSavedViewName(event.target.value)}
              />
            </label>
            <label className="research-field">
              <span>Column</span>
              <select
                value={savedViewColumnId}
                onChange={(event) => setSavedViewColumnId(event.target.value)}
              >
                {workspace.columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="research-field">
              <span>Rule</span>
              <select
                value={savedViewOperator}
                onChange={(event) => {
                  const operator = event.target.value as RunConditionOperator;
                  setSavedViewOperator(operator);
                  if (!conditionNeedsValue(operator)) setSavedViewValue('');
                }}
              >
                {conditionOperators.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </select>
            </label>
            {conditionNeedsValue(savedViewOperator) ? (
              <label className="research-field">
                <span>Value</span>
                <input
                  value={savedViewValue}
                  onChange={(event) => setSavedViewValue(event.target.value)}
                  placeholder="Enter a comparison value"
                />
              </label>
            ) : null}
          </div>
          <div className="saved-view-preview">
            <Filter />
            <span>
              <strong>
                {
                  workspace.rows.filter((row) =>
                    rowMatchesSavedView(row, {
                      id: 'preview',
                      name: savedViewName,
                      columnId: savedViewColumnId,
                      operator: savedViewOperator,
                      value: savedViewValue,
                      createdAt: 0,
                    }),
                  ).length
                }{' '}
                matching rows
              </strong>
              <small>Updates automatically as table values change.</small>
            </span>
          </div>
          {savedViewError ? (
            <p className="apollo-error" role="alert">
              {savedViewError}
            </p>
          ) : null}
          <div className="rename-actions">
            <Button variant="outline" onClick={() => setSavedViewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveCurrentView} disabled={!savedViewReady}>
              <BookmarkPlus /> Save view
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="rename-dialog">
          <DialogHeader>
            <DialogTitle>Rename workspace</DialogTitle>
            <DialogDescription>
              Give this table a name that matches the audience or campaign.
            </DialogDescription>
          </DialogHeader>
          <label className="rename-field">
            <span>Workspace name</span>
            <input
              value={workspaceNameDraft}
              onChange={(event) => setWorkspaceNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') renameWorkspace();
              }}
            />
          </label>
          <div className="rename-actions">
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={renameWorkspace}
              disabled={!workspaceNameDraft.trim()}
            >
              Save name
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={handoffOpen} onOpenChange={setHandoffOpen}>
        <DialogContent className="handoff-dialog">
          <DialogHeader>
            <DialogTitle>Prepare CRM handoff</DialogTitle>
            <DialogDescription>
              Choose the destination and map only the fields GTM Control Tower
              should validate. Pomade will not write to either CRM.
            </DialogDescription>
          </DialogHeader>
          <div className="handoff-route">
            <div>
              <Table2 />
              <span>
                <strong>Pomade</strong>
                <small>{handoffPlan.records.length} selected records</small>
              </span>
            </div>
            <span className="handoff-arrow">→</span>
            <div>
              <ShieldCheck />
              <span>
                <strong>GTM Control Tower</strong>
                <small>
                  {handoffProvider === 'hubspot'
                    ? 'HubSpot Contact'
                    : 'Salesforce Lead'}{' '}
                  · preview, approve, receipt, rollback
                </small>
              </span>
            </div>
          </div>
          <div className="handoff-destinations" aria-label="CRM destination">
            <button
              type="button"
              className={handoffProvider === 'hubspot' ? 'selected' : ''}
              onClick={() => setHandoffProvider('hubspot')}
            >
              <Building2 />
              <span>
                <strong>HubSpot</strong>
                <small>Contact properties</small>
              </span>
            </button>
            <button
              type="button"
              className={handoffProvider === 'salesforce' ? 'selected' : ''}
              onClick={() => setHandoffProvider('salesforce')}
            >
              <Cloud />
              <span>
                <strong>Salesforce</strong>
                <small>Lead fields</small>
              </span>
            </button>
          </div>
          <div className="handoff-guards">
            <div>
              <span>Mode</span>
              <strong>Preview only</strong>
            </div>
            <div>
              <span>Create records</span>
              <strong>Blocked</strong>
            </div>
            <div>
              <span>Mapped</span>
              <strong>{handoffPlan.fieldMappings.length} fields</strong>
            </div>
          </div>
          <div className="handoff-mapping">
            <div className="handoff-mapping-header">
              <span>Pomade column</span>
              <span>Control Tower field</span>
              <span>
                {handoffProvider === 'hubspot' ? 'HubSpot' : 'Salesforce'}
              </span>
            </div>
            <div className="handoff-mapping-list">
              {handoffColumns.map((column) => {
                const mapped = handoffPlan.fieldMappings.find(
                  (mapping) => mapping.sourceColumnId === column.id,
                );
                const selectedField = handoffMappingByColumn[column.id] ?? '';
                const usedFields = new Set(
                  Object.entries(handoffMappingByColumn)
                    .filter(([columnId]) => columnId !== column.id)
                    .map(([, contactField]) => contactField)
                    .filter(Boolean),
                );
                return (
                  <label key={column.id}>
                    <span title={column.title}>{column.title}</span>
                    <select
                      aria-label={`Map ${column.title}`}
                      value={selectedField}
                      onChange={(event) =>
                        setHandoffMappingByColumn((current) => ({
                          ...current,
                          [column.id]: event.target
                            .value as ControlTowerContactField,
                        }))
                      }
                    >
                      <option value="">Do not send</option>
                      {CONTROL_TOWER_FIELD_SPECS.map((field) => (
                        <option
                          key={field.id}
                          value={field.id}
                          disabled={usedFields.has(field.id)}
                        >
                          {field.label}
                        </option>
                      ))}
                    </select>
                    <code>{mapped?.destinationFields.join(' + ') || '—'}</code>
                  </label>
                );
              })}
            </div>
          </div>
          {handoffRequirements.length ? (
            <output className="handoff-warning">
              Map {handoffRequirements.join(', ')} so Control Tower can evaluate
              the {handoffProvider === 'hubspot' ? 'HubSpot' : 'Salesforce'}{' '}
              clean record gate. The preview may still be downloaded for review.
            </output>
          ) : (
            <p className="handoff-ready">
              Required identity fields are mapped. Control Tower will still run
              its duplicate, freshness, and field-level validation before any
              approval is available.
            </p>
          )}
          <div className="handoff-list">
            {handoffPlan.records.slice(0, 5).map((record) => (
              <div key={record.rowId}>
                <span>
                  {record.proposedFields.company ||
                    record.proposedFields.fullName ||
                    'Untitled row'}
                </span>
                <small>{record.externalKey}</small>
                <strong>
                  {Object.keys(record.proposedFields).length} fields
                </strong>
              </div>
            ))}
          </div>
          <div className="handoff-actions">
            <p>
              The downloaded plan contains data already visible in this grid.
              Control Tower remains the only place that can execute a CRM write.
            </p>
            <Button variant="outline" onClick={() => setHandoffOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={downloadControlTowerPlan}
              disabled={
                !handoffPlan.records.length || !handoffPlan.fieldMappings.length
              }
            >
              <Download /> Download preview plan
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={apolloOpen} onOpenChange={setApolloOpen}>
        <DialogContent className="apollo-dialog">
          <DialogHeader>
            <DialogTitle>
              {apolloTargetRows.length === 1
                ? `Enrich ${apolloTargetValues.person || 'selected person'} with Apollo`
                : `Enrich ${apolloTargetRows.length} selected people with Apollo`}
            </DialogTitle>
            <DialogDescription>
              Match each eligible person at their current company and return a
              verified business profile.
            </DialogDescription>
          </DialogHeader>
          {apolloTargetRows.length === 1 ? (
            <div className="apollo-target">
              <div>
                <span>Person</span>
                <strong>
                  {apolloTargetValues.person || 'Missing person name'}
                </strong>
              </div>
              <div>
                <span>Company</span>
                <strong>
                  {apolloTargetValues.company || 'Unknown company'}
                </strong>
              </div>
              <div>
                <span>Domain</span>
                <strong>
                  {apolloTargetValues.domain || 'Missing company domain'}
                </strong>
              </div>
            </div>
          ) : (
            <div className="apollo-target apollo-batch-target">
              <div>
                <span>Selected</span>
                <strong>{apolloTargetRows.length} rows</strong>
              </div>
              <div>
                <span>Ready</span>
                <strong>{apolloEligibleRows.length} people</strong>
              </div>
              <div>
                <span>Skipped</span>
                <strong>
                  {apolloTargetRows.length - apolloEligibleRows.length} missing
                  inputs
                </strong>
              </div>
            </div>
          )}
          <div className="apollo-safety">
            <ShieldCheck />
            <div>
              <strong>
                {apolloStatus?.configured
                  ? 'Apollo key is configured'
                  : 'Apollo key is not configured'}
              </strong>
              <p>
                This action sends each eligible person name and company domain
                to Apollo. It may use up to {apolloEligibleRows.length} Apollo{' '}
                {apolloEligibleRows.length === 1 ? 'credit' : 'credits'}; cache
                hits may reduce that total. Personal emails and phone numbers
                stay off.
              </p>
            </div>
          </div>
          {apolloBatchSummary && apolloBatchSummary.requested > 1 ? (
            <div
              className={`apollo-result ${apolloBatchSummary.failed ? 'apollo-result-needs_review' : ''}`}
            >
              <MailCheck />
              <div>
                <strong>
                  {apolloBatchSummary.completed} enriched ·{' '}
                  {apolloBatchSummary.failed} failed ·{' '}
                  {apolloBatchSummary.skipped} skipped
                </strong>
                <p>
                  Every completed row has its own identity evidence and receipt
                  in the grid. Failed rows were left unchanged.
                </p>
                <small>
                  {apolloBatchSummary.creditsConsumed === null
                    ? 'Apollo did not report total credit usage'
                    : `${apolloBatchSummary.creditsConsumed} total Apollo credit${apolloBatchSummary.creditsConsumed === 1 ? '' : 's'} used`}
                </small>
              </div>
            </div>
          ) : apolloResult ? (
            <div
              className={`apollo-result apollo-result-${apolloResult.status}`}
            >
              <MailCheck />
              <div>
                <strong>
                  {apolloResult.status === 'found'
                    ? apolloResult.workEmail
                    : apolloResult.status === 'not_found'
                      ? 'No Apollo match found'
                      : 'Match held for review'}
                </strong>
                <p>{apolloResult.evidence.join(' ')}</p>
                <small>
                  {apolloResult.cached
                    ? 'Cache hit · 0 new credits'
                    : apolloResult.creditsConsumed === null
                      ? 'Apollo did not report credit usage'
                      : `${apolloResult.creditsConsumed} Apollo credit${apolloResult.creditsConsumed === 1 ? '' : 's'} used`}
                </small>
              </div>
            </div>
          ) : null}
          {apolloError ? (
            <p className="apollo-error" role="alert">
              {apolloError}
            </p>
          ) : null}
          <div className="apollo-dialog-actions">
            <div className="phone-next">
              <Phone />
              <span>
                <strong>Phone reveal is separate</strong>
                <small>
                  It can cost 8 extra credits and needs a public webhook.
                </small>
              </span>
            </div>
            <Button
              className="apollo-submit"
              onClick={enrichSelectedWithApollo}
              disabled={
                apolloRunning ||
                !apolloStatus?.configured ||
                apolloEligibleRows.length === 0 ||
                apolloTargetRows.length > 10
              }
            >
              {apolloRunning ? (
                <LoaderCircle className="spin" />
              ) : (
                <MailCheck />
              )}
              {apolloRunning
                ? `Checking ${apolloEligibleRows.length} ${apolloEligibleRows.length === 1 ? 'person' : 'people'}…`
                : apolloTargetRows.length > 10
                  ? 'Select 10 rows or fewer'
                  : `Use up to ${apolloEligibleRows.length} ${apolloEligibleRows.length === 1 ? 'credit' : 'credits'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
