'use client';

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
  CirclePlay,
  Cloud,
  Columns3,
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
  Rows3,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  Users,
  WandSparkles,
  Workflow,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Papa from 'papaparse';
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
import ChangeSignals from '@/components/change-signals';
import RecipeFunctionBuilder from '@/components/recipe-function-builder';
import TableTransferBuilder from '@/components/table-transfer-builder';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import RunConditionEditor from './run-condition-editor';
import { conditionOperators, conditionNeedsValue } from '@/lib/run-conditions';
import CrmSyncBuilder from './crm-sync-builder';
import { applyCrmImport, type CrmImportMode } from '@/lib/crm-import';
import {
  deleteWorkspaceColumn,
  findColumnDependencies,
  renameWorkspaceColumn,
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
import { moveWorkspaceColumn, resizeWorkspaceColumn } from '@/lib/grid-columns';
import { createPeopleListWorkspace } from '@/lib/people-list-builder';
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
import {
  MAX_BACKGROUND_RESEARCH_ACTIONS,
  MAX_BACKGROUND_ROWS,
  canPauseRunJob,
  canResumeRunJob,
  runJobPercent,
} from '@/lib/run-job';
import { createSampleWorkspace } from '@/lib/sample-workspace';

const PomadeDataGrid = dynamic(() => import('@/components/pomade-data-grid'), {
  ssr: false,
  loading: () => <div className="grid-loading">Shaping your workspace…</div>,
});

type FilterMode = 'All' | 'Ready' | 'Review';
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
    requires: 'Parallel or Google AI key + company context',
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
    description: 'Draft an editable first line from the row context.',
    requires: 'Person + company',
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

function canonicalColumnId(header: string) {
  const slug = slugify(header);
  if (['company', 'company_name', 'account', 'account_name'].includes(slug))
    return 'company';
  if (['person', 'name', 'full_name', 'contact', 'contact_name'].includes(slug))
    return 'person';
  if (['title', 'job_title', 'role'].includes(slug)) return 'title';
  if (['domain', 'website', 'company_website', 'company_domain'].includes(slug))
    return 'domain';
  if (['email', 'email_address', 'work_email'].includes(slug)) return 'email';
  if (['phone', 'phone_number', 'mobile'].includes(slug)) return 'phone';
  return slug;
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

function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <span>P</span>
    </span>
  );
}

export default function PomadeWorkspace({
  deployment,
  workspaceId,
  initialRowId = '',
  onTableState,
  onOpenTable,
  onCopyRows,
}: {
  deployment: { hosted: boolean; label: string; schedulesEnabled: boolean };
  workspaceId: string;
  initialRowId?: string;
  onTableState: (summary: TableSummary, canLeave: boolean) => void;
  onOpenTable: (tableId: string, rowId?: string) => void;
  onCopyRows: (rowIds: string[]) => void;
}) {
  const workspaceUrl = `/api/workspace?workspaceId=${encodeURIComponent(workspaceId)}`;
  const versionsUrl = `/api/workspace/versions?workspaceId=${encodeURIComponent(workspaceId)}`;
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(() => ({
    ...createSampleWorkspace(),
    id: workspaceId,
    rows: [],
  }));
  const [activeRowId, setActiveRowId] = useState('sample-1');
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [runHistory, setRunHistory] = useState<RunReceipt[]>([]);
  const [latestRun, setLatestRun] = useState<RunReceipt>();
  const [receiptRun, setReceiptRun] = useState<RunReceipt>();
  const [saveState, setSaveState] = useState<SaveState>('Loading');
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('All');
  const [activeSavedViewId, setActiveSavedViewId] = useState('');
  const [query, setQuery] = useState('');
  const [sortAscending, setSortAscending] = useState(true);
  const [notice, setNotice] = useState('');

  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [lookupBuilderOpen, setLookupBuilderOpen] = useState(false);
  const [providerBuilderOpen, setProviderBuilderOpen] = useState(false);
  const [httpBuilderOpen, setHttpBuilderOpen] = useState(false);
  const [formulaBuilderOpen, setFormulaBuilderOpen] = useState(false);
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
  const [pendingRunRowIds, setPendingRunRowIds] = useState<string[]>([]);
  const [pendingRunColumnIds, setPendingRunColumnIds] = useState<string[]>([]);
  const [pendingRunMode, setPendingRunMode] =
    useState<PendingRunMode>('immediate');
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
  const [sourceLoading, setSourceLoading] = useState<CrmProvider>();
  const [sourceError, setSourceError] = useState('');
  const [sourcePreview, setSourcePreview] = useState<CrmSourcePreview>();

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
  const recipeFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(workspaceUrl).then((response) => {
        if (!response.ok) throw new Error('Workspace failed to load');
        return response.json() as Promise<{ workspace: WorkspaceSnapshot }>;
      }),
      fetch(`/api/runs?workspaceId=${encodeURIComponent(workspaceId)}`).then(
        (response) => {
          if (!response.ok) throw new Error('Runs failed to load');
          return response.json() as Promise<{ runs: RunReceipt[] }>;
        },
      ),
    ])
      .then(([workspaceResponse, runsResponse]) => {
        if (cancelled) return;
        setSavedWorkspace(workspaceResponse.workspace);
        setLoaded(true);
        setWorkspace(workspaceResponse.workspace);
        const focused = workspaceResponse.workspace.rows.find(
          (row) => row.id === initialRowId,
        );
        setActiveRowId(
          focused?.id ?? workspaceResponse.workspace.rows[0]?.id ?? '',
        );
        if (initialRowId && !focused)
          setNotice('The linked source row no longer exists.');
        setRunHistory(runsResponse.runs);
        setLatestRun(runsResponse.runs[0]);
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
        if (changed) {
          const [workspaceResponse, runsResponse] = await Promise.all([
            fetch(workspaceUrl),
            fetch(`/api/runs?workspaceId=${encodeURIComponent(workspaceId)}`),
          ]);
          if (cancelled || !workspaceResponse.ok || !runsResponse.ok) return;
          const workspaceResult = (await workspaceResponse.json()) as {
            workspace: WorkspaceSnapshot;
          };
          const runsResult = (await runsResponse.json()) as {
            runs: RunReceipt[];
          };
          if (cancelled) return;
          setSavedWorkspace(workspaceResult.workspace);
          setWorkspace(workspaceResult.workspace);
          setRunHistory(runsResult.runs);
          setLatestRun(runsResult.runs[0]);
          setSaveState('Saved');
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
    const timer = window.setTimeout(() => setNotice(''), 4_000);
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

  const selected =
    workspace.rows.find((row) => row.id === activeRowId) ?? workspace.rows[0];
  const selectedValues = selected?.values ?? {};
  const editedColumn = workspace.columns.find(
    (column) => column.id === columnEditorId,
  );
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
  const activeTemplate = recipeTemplates.find(
    (template) => template.id === activeTemplateId,
  );
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
  const pendingWebResearchColumns = useMemo(
    () =>
      pendingRunColumnIds.length
        ? webResearchColumns.filter((column) =>
            pendingRunColumnIds.includes(column.id),
          )
        : webResearchColumns,
    [pendingRunColumnIds, webResearchColumns],
  );
  const connectedCount = [
    apolloStatus?.configured,
    researchStatus?.configured,
    crmCatalog.providers.hubspot.configured,
    crmCatalog.providers.salesforce.configured,
  ].filter(Boolean).length;
  const pendingResearchActionCount = useMemo(() => {
    const pending = new Set(pendingRunRowIds);
    return countMaximumExternalActions(
      workspace.rows.filter((row) => pending.has(row.id)),
      pendingWebResearchColumns,
    );
  }, [pendingRunRowIds, pendingWebResearchColumns, workspace.rows]);
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
  const maximumResearchActions =
    researchStatus?.capabilities.maximumActionsPerRun ?? 10;
  const pendingResearchActionLimit =
    pendingRunMode === 'background'
      ? MAX_BACKGROUND_RESEARCH_ACTIONS
      : maximumResearchActions;
  const latestRunJob = runJobs[0];
  const currentRunJob =
    latestRunJob &&
    ['queued', 'running', 'paused', 'failed'].includes(latestRunJob.status)
      ? latestRunJob
      : undefined;
  const jobLocksWorkspace = Boolean(
    running ||
    apolloRunning ||
    jobSaving ||
    restoringVersionId ||
    (currentRunJob &&
      (currentRunJob.status === 'queued' ||
        currentRunJob.status === 'running' ||
        (currentRunJob.status === 'paused' && currentRunJob.leaseUntil))),
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
  const scheduleTimestamp = new Date(scheduleRunAt).getTime();
  const scheduleReady =
    !scheduleScopeError &&
    (!scheduleCrmIds.length || scheduleCrmConfirmed) &&
    (!scheduleSourceEnabled ||
      (Boolean(workspace.apiSourceRefresh) && scheduleSourceConfirmed)) &&
    recipeCount > 0 &&
    Number.isFinite(scheduleTimestamp) &&
    scheduleTimestamp > scheduleNow &&
    (scheduledTargetRows.length > 0 || scheduleSourceEnabled) &&
    scheduledResearchActionCount <= maximumResearchActions &&
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
      setWorkspace((current) => {
        const changedById = new Map(
          changedRows.map((row) => [
            row.id,
            recalculateAutomaticFormulas(row, current.columns, editedColumnId),
          ]),
        );
        return {
          ...current,
          rows: current.rows.map((row) => changedById.get(row.id) ?? row),
          updatedAt: Date.now(),
        };
      });
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
      setWorkspace(moveWorkspaceColumn(workspace, startIndex, endIndex));
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
    setColumnEditorError('');
    setColumnEditorOpen(true);
  }

  function renameColumn() {
    try {
      setWorkspace(
        renameWorkspaceColumn(workspace, columnEditorId, columnEditorTitle),
      );
      setColumnEditorOpen(false);
      setNotice('Column renamed without changing its recipe ID.');
    } catch (error) {
      setColumnEditorError(
        error instanceof Error
          ? error.message
          : 'The column could not be renamed.',
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

  function addRecipeColumn(preset: RecipePreset) {
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
    patch: Partial<Pick<PomadeColumn, 'autoRun' | 'runCondition'>>,
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
    setTemplateBindings(defaultTemplateBindings(template, workspace.columns));
    setTemplateError('');
    setTemplateUseOpen(true);
  }

  function useRecipeTemplate() {
    if (!activeTemplate || !templateBindingsReady) return;
    try {
      const addedColumns = instantiateRecipeTemplate(
        activeTemplate,
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

  function openResearchBuilder() {
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
    if (mode === researchOutputMode) return;
    if (mode === 'list' && researchOutputMode === 'single') {
      setResearchPrompt(DEFAULT_LIST_RESEARCH_PROMPT);
      setResearchFields(defaultListResearchFields());
    } else if (researchOutputMode === 'list' && mode === 'single') {
      setResearchPrompt(DEFAULT_RESEARCH_PROMPT);
      setResearchFields(defaultResearchFields());
    }
    setResearchOutputMode(mode);
  }

  function openFormulaBuilder() {
    setAddColumnOpen(false);
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

  function cycleFilter() {
    setSelectedRowIds([]);
    setActiveSavedViewId('');
    setFilter((current) =>
      current === 'All' ? 'Ready' : current === 'Ready' ? 'Review' : 'All',
    );
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
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        const used = new Set<string>();
        const mappings = (meta.fields ?? []).map((header) => ({
          header,
          id: uniqueId(canonicalColumnId(header), used),
        }));
        const columns: PomadeColumn[] = mappings.map(({ header, id }) => ({
          id,
          title: header,
          kind: 'text',
          width: Math.max(150, Math.min(280, header.length * 10 + 80)),
        }));
        if (!used.has('status'))
          columns.push({
            id: 'status',
            title: 'Run status',
            kind: 'status',
            width: 140,
          });
        const columnIds = new Set(columns.map((column) => column.id));
        const savedViews = (workspace.savedViews ?? []).filter((view) =>
          columnIds.has(view.columnId),
        );
        const removedViewCount =
          (workspace.savedViews?.length ?? 0) - savedViews.length;
        const rows = data.map((record) => ({
          id: crypto.randomUUID(),
          values: Object.fromEntries([
            ...mappings.map(({ header, id }) => [
              id,
              String(record[header] ?? ''),
            ]),
            ['status', 'Imported'],
          ]),
        }));
        const next: WorkspaceSnapshot = {
          ...workspace,
          name: file.name.replace(/\.csv$/i, '') || 'Imported table',
          columns,
          rows,
          savedViews,
          updatedAt: Date.now(),
          source: {
            provider: 'csv',
            label: file.name,
            importedAt: Date.now(),
          },
          schedule: workspace.schedule?.enabled
            ? pauseRecipeSchedule(workspace.schedule)
            : workspace.schedule,
        };
        setWorkspace(next);
        setActiveRowId(rows[0]?.id ?? '');
        setSelectedRowIds([]);
        setFilter('All');
        setActiveSavedViewId('');
        setQuery('');
        setSourcesOpen(false);
        setNotice(
          `${rows.length} CSV rows loaded${removedViewCount ? ` · ${removedViewCount} incompatible ${removedViewCount === 1 ? 'view' : 'views'} removed` : ''}${workspace.schedule?.enabled ? ' · schedule paused for review' : ''}.`,
        );
      },
      error: () => setSourceError('Pomade could not read that CSV file.'),
    });
  }

  function exportCsv() {
    const records = workspace.rows.map((row) =>
      Object.fromEntries(
        workspace.columns.map((column) => [
          column.title,
          row.values[column.id] ?? '',
        ]),
      ),
    );
    const blob = new Blob([Papa.unparse(records)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slugify(workspace.name)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`${workspace.rows.length} rows exported.`);
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
    if (running || rowIds.length === 0) return;
    if (
      deployment.hosted &&
      researchStatus?.companion &&
      workspace.columns.some(
        (column) =>
          column.recipe === 'web-research' &&
          (!columnIds || columnIds.includes(column.id)),
      )
    )
      return queueBackgroundRun(rowIds, confirmExternalResearch, columnIds);
    const target = new Set(rowIds);
    const eligibleResearchActions = countMaximumExternalActions(
      workspace.rows.filter((row) => target.has(row.id)),
      columnIds?.length
        ? webResearchColumns.filter((column) => columnIds.includes(column.id))
        : webResearchColumns,
    );
    if (eligibleResearchActions > 0 && !confirmExternalResearch) {
      setPendingRunRowIds(rowIds);
      setPendingRunColumnIds(columnIds ?? []);
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
    if (jobSaving || !rowIds.length) return;
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
    const scopedResearchColumns = columnIds?.length
      ? webResearchColumns.filter((column) => columnIds.includes(column.id))
      : webResearchColumns;
    const researchActionCount = countMaximumExternalActions(
      workspace.rows.filter((row) => target.has(row.id)),
      scopedResearchColumns,
    );
    if (researchActionCount > 0 && !confirmExternalResearch) {
      setPendingRunRowIds(rowIds);
      setPendingRunColumnIds(columnIds ?? []);
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

  async function updateRunJob(job: RunJob, action: 'pause' | 'resume') {
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
      setNotice(
        action === 'pause'
          ? 'Background run paused after any in-flight row finishes.'
          : 'Background run resumed.',
      );
    } catch (error) {
      setJobError(
        error instanceof Error ? error.message : `The job could not ${action}.`,
      );
    } finally {
      setJobSaving(false);
    }
  }

  async function previewCrmSource(provider: CrmProvider) {
    setSourceLoading(provider);
    setSourceError('');
    setSourcePreview(undefined);
    try {
      const response = await fetch('/api/providers/crm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          objectType: sourceObjects[provider],
          fields: sourceFields[provider]
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean),
          limit: 50,
        }),
      });
      const result = (await response.json()) as {
        preview?: CrmSourcePreview;
        error?: string;
      };
      if (!response.ok || !result.preview) {
        throw new Error(result.error || 'The CRM source could not be read.');
      }
      setSourcePreview(result.preview);
    } catch (error) {
      setSourceError(
        error instanceof Error
          ? error.message
          : 'The CRM source could not be read.',
      );
    } finally {
      setSourceLoading(undefined);
    }
  }

  function importCrmPreview(mode: CrmImportMode) {
    if (!sourcePreview) return;
    const imported = applyCrmImport(workspace, sourcePreview, mode);
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
      <main className="pomade-shell workbook-loading">
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
        <div className="brand-lockup">
          <LogoMark />
          <span className="brand-name">Pomade</span>
          <span
            className="deployment-badge"
            title={
              deployment.hosted
                ? 'Hosted tables are separate from your local tables. Scheduled automations are paused.'
                : 'Tables saved on this Mac. Hosted tables are separate.'
            }
          >
            {deployment.label}
          </span>
          <span className="crumb">/</span>
          <button
            className="workspace-name"
            type="button"
            onClick={openRename}
            disabled={jobLocksWorkspace}
          >
            {workspace.name} <ChevronDown />
          </button>
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
          <span className={`sync-state sync-${saveState.toLowerCase()}`}>
            {saveState === 'Saving' ? (
              <LoaderCircle className="spin" />
            ) : (
              <Cloud />
            )}{' '}
            {saveState}
          </span>
          <button
            className={`usage-pill ${connectedCount ? 'usage-pill-connected' : ''}`}
            type="button"
            onClick={() => setSourcesOpen(true)}
          >
            <Plug />
            <strong>{connectedCount}/4</strong> connected
          </button>
          <div className="avatar" aria-label="Harrison account">
            H
          </div>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="sidebar">
          <p className="sidebar-label">Workspace</p>
          <nav aria-label="Workspace navigation">
            <button className="nav-item active" type="button">
              <Table2 /> {workspace.name} <span>{workspace.rows.length}</span>
            </button>
            <button
              className="nav-item"
              type="button"
              onClick={() => setHistoryOpen(true)}
            >
              <History /> Run history <span>{runHistory.length}</span>
            </button>
            <button
              className="nav-item"
              type="button"
              onClick={() => setBackgroundRunsOpen(true)}
            >
              <Cloud /> Background runs <span>{runJobs.length}</span>
            </button>
            <button
              className="nav-item"
              type="button"
              onClick={() => setSourcesOpen(true)}
            >
              <Database /> Sources <span>{connectedCount}/4</span>
            </button>
            <button
              className="nav-item"
              type="button"
              onClick={() => setAddColumnOpen(true)}
              disabled={jobLocksWorkspace}
            >
              <Library /> Recipe library <span>{recipeTemplates.length}</span>
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
            onClick={() => setAddColumnOpen(true)}
            disabled={jobLocksWorkspace}
          >
            <Plus /> Add recipe column
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
          <div className="table-toolbar">
            <div className="toolbar-cluster">
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
                onClick={() => setSourcesOpen(true)}
                disabled={jobLocksWorkspace}
              >
                <Upload /> Load data
              </Button>
              <ProviderPresetBuilder
                key={`presets-${workspace.id}`}
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
                  setNotice(
                    'Apollo company columns added. Review and run when ready.',
                  );
                }}
              />
              <ChangeSignals
                key={`signals-${workspace.id}`}
                workspace={workspace}
                ready={canLeaveTable}
                onSave={setWorkspace}
                onOpenRow={(id) => onOpenTable(workspace.id, id)}
              />
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
                      added.some(isExternalRecipe) && current.schedule?.enabled
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
              <CrmSyncBuilder
                key={workspace.id}
                onSave={setWorkspace}
                workspace={workspace}
                rowIds={handoffRowIds}
                ready={canLeaveTable && !jobLocksWorkspace}
              />
              <TableTransferBuilder
                source={workspace}
                saved={canLeaveTable}
                selectedRowIds={selectedRowIds}
                onSave={setWorkspace}
              />
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
              <span className="toolbar-divider" />
              <span className="toolbar-stat">
                <Rows3 /> {visibleRows.length} rows
              </span>
              <Button
                variant="ghost"
                onClick={() => setAddColumnOpen(true)}
                disabled={jobLocksWorkspace}
              >
                <Columns3 /> {workspace.columns.length} columns
              </Button>
              <Button
                variant="ghost"
                onClick={sortRows}
                disabled={jobLocksWorkspace}
              >
                <ArrowDownUp /> Sort
              </Button>
              <Button
                variant={
                  filter === 'All' && !activeSavedView ? 'ghost' : 'secondary'
                }
                onClick={cycleFilter}
              >
                <Filter />
                {activeSavedView?.name ??
                  (filter === 'All' ? 'Filter' : filter)}
              </Button>
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
            </div>
            <div className="toolbar-cluster toolbar-actions">
              {selectedRowIds.length ? (
                <span className="selection-chip">
                  {selectedRowIds.length} selected
                </span>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" />}>
                  Action <ChevronDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={addBlankRow}
                    disabled={jobLocksWorkspace}
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
                    onClick={openResearchBuilder}
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
                {running ? <LoaderCircle className="spin" /> : <WandSparkles />}
                {running
                  ? 'Running…'
                  : `Run ${runTargetIds.length} ${
                      selectedRowIds.length
                        ? 'selected'
                        : filter === 'All' && !query
                          ? 'rows'
                          : 'visible'
                    }`}
              </Button>
            </div>
          </div>

          <div className="grid-frame">
            <PomadeDataGrid
              key={`${filter}|${query}|${visibleRows.map((row) => row.id).join('|')}`}
              columns={workspace.columns}
              rows={visibleRows}
              readOnly={jobLocksWorkspace}
              onColumnResize={resizeColumn}
              onColumnsReorder={reorderColumns}
              onColumnMenu={openColumnEditor}
              onRowsChange={updateVisibleRows}
              onActiveRowChange={setActiveRowId}
              onSelectedRowIdsChange={updateSelectedRows}
            />
            {notice ? (
              <output className="workspace-toast">
                <Check /> {notice}
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
                : 'Changes persist automatically'}
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
              {workspace.rows.length} records · {recipeCount} recipes
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
            <span>{workspace.source?.label ?? 'Manual workspace'}</span>
            <span>Grid by Glide Data Grid</span>
          </footer>
        </section>

        <aside className="inspector">
          <div className="inspector-heading">
            <div>
              <p>Active record</p>
              <h2>{selectedValues.company || 'Untitled row'}</h2>
            </div>
            <span
              className={`record-status record-status-${(selectedValues.status || 'draft').toLowerCase()}`}
            >
              {selectedValues.status || 'Draft'}
            </span>
          </div>
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
              {new Date(selected.apiSource.fetchedAt).toLocaleString()} · batch{' '}
              {selected.apiSource.batchId.slice(0, 8)}
            </p>
          ) : null}
          {selected?.webhookSource ? (
            <p className="source-record-link">
              Webhook: {selected.webhookSource.sourceId} · received{' '}
              {new Date(selected.webhookSource.receivedAt).toLocaleString()} ·
              event {selected.webhookSource.eventId.slice(0, 12)}
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
              <strong>{selectedValues.domain ? 'Present' : 'Missing'}</strong>
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
            onClick={openResearchBuilder}
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
                Run this row to see every field-level result and review state.
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
        </aside>
      </div>

      <ProviderWaterfallBuilder
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
      <Dialog open={addColumnOpen} onOpenChange={setAddColumnOpen}>
        <DialogContent className="recipe-dialog">
          <DialogHeader>
            <DialogTitle>Add a recipe column</DialogTitle>
            <DialogDescription>
              Start from a saved function or add a new transformation or
              research step. Results stay editable after every run.
            </DialogDescription>
          </DialogHeader>
          <div className="recipe-group-heading">
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
                setProviderBuilderOpen(true);
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
          {recipeFileMessage ? (
            <output className="template-no-inputs">{recipeFileMessage}</output>
          ) : null}
          {recipeTemplates.length ? (
            <section className="recipe-group template-library">
              <div className="recipe-group-heading">
                <span>Saved functions</span>
                <small>{recipeTemplates.length} reusable</small>
              </div>
              <div className="template-library-list">
                {recipeTemplates.map((template) => {
                  const outputCount = template.column.outputFields?.length ?? 1;
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
            <section className="recipe-group" key={group}>
              <div className="recipe-group-heading">
                <span>{group}</span>
                <small>
                  {group === 'Transform'
                    ? 'Instant, deterministic formulas'
                    : 'Safe demo enrichment recipes'}
                </small>
              </div>
              <div className="recipe-presets">
                {recipePresets
                  .filter((preset) => preset.group === group)
                  .map((preset) => (
                    <button
                      key={`${preset.recipe}-${preset.title}`}
                      type="button"
                      onClick={() =>
                        preset.recipe === 'custom-formula'
                          ? openFormulaBuilder()
                          : preset.recipe === 'waterfall'
                            ? openWaterfallBuilder()
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
              disabled={!activeTemplate || !templateBindingsReady}
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
              value={formulaExpression}
              maxLength={2_000}
              onChange={(event) => setFormulaExpression(event.target.value)}
              placeholder="{{person | first}} at {{company}}"
            />
          </label>
          <div className="formula-help">
            <div className="research-variables" aria-label="Available columns">
              <span>Insert a column</span>
              {workspace.columns
                .filter((column) => column.kind !== 'status')
                .map((column) => (
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
            <Button
              variant="outline"
              onClick={() => setFormulaBuilderOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={addCustomFormulaColumn}
              disabled={!formulaColumnName.trim() || !formulaExpression.trim()}
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
            <Button onClick={addWaterfallColumn} disabled={!waterfallReady}>
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
          <ResearchConnectionStatus
            status={researchStatus}
            checking={researchStatusLoading}
            onRefresh={() => setResearchStatusRevision((value) => value + 1)}
          />
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
                  : 'Your API key stays server-side. Results and citations are saved with the workspace receipt.'}
            </p>
            <Button
              variant="outline"
              onClick={() => setResearchBuilderOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={addWebResearchColumn}
              disabled={!researchOutputReady || !researchPrompt.trim()}
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
              {pendingRunMode === 'background'
                ? 'Queue external requests?'
                : 'Run external requests?'}
            </DialogTitle>
            <DialogDescription>
              These recipes send configured row values to research providers or
              HTTP connections. Each request may consume provider credits or
              have effects defined by the endpoint
              {pendingRunMode === 'background'
                ? '. Background jobs continue while Pomade’s local server is running.'
                : '.'}
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
              <span>Maximum requests</span>
              <strong>{pendingResearchActionCount}</strong>
            </div>
            <div>
              <span>Possible new rows</span>
              <strong>{pendingListRowLimit}</strong>
            </div>
          </div>
          {pendingResearchActionCount > pendingResearchActionLimit ? (
            <p className="research-warning" role="alert">
              {pendingRunMode === 'background'
                ? `One background job allows ${pendingResearchActionLimit} external requests across up to ${MAX_BACKGROUND_ROWS} rows.`
                : `This immediate run allows ${pendingResearchActionLimit} external requests.`}{' '}
              Select fewer rows or external recipe columns.
            </p>
          ) : (
            <p className="research-safety">
              The maximum includes steps whose conditions may become true after
              an earlier result. HTTP recipes send only configured inputs;
              research may use row context. Receipts show results and unknown
              costs. List recipes replace only their earlier child rows.
            </p>
          )}
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
                const mode = pendingRunMode;
                setResearchConfirmOpen(false);
                setPendingRunRowIds([]);
                setPendingRunColumnIds([]);
                setPendingRunMode('immediate');
                if (mode === 'background') {
                  void queueBackgroundRun(
                    rowIds,
                    true,
                    columnIds.length ? columnIds : undefined,
                  );
                } else {
                  void runEnrichment(
                    rowIds,
                    true,
                    columnIds.length ? columnIds : undefined,
                  );
                }
              }}
              disabled={
                (pendingWebResearchColumns.some(
                  (column) => column.recipe === 'web-research',
                ) &&
                  (researchStatusLoading || !researchStatus?.configured)) ||
                pendingResearchActionCount === 0 ||
                pendingResearchActionCount > pendingResearchActionLimit ||
                jobSaving
              }
            >
              <Globe2 />
              {pendingRunMode === 'background'
                ? `Queue ${pendingRunRowIds.length} rows`
                : `Run ${pendingRunRowIds.length} rows`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={backgroundRunsOpen} onOpenChange={setBackgroundRunsOpen}>
        <DialogContent className="background-runs-dialog">
          <DialogHeader>
            <DialogTitle>Background runs</DialogTitle>
            <DialogDescription>
              Durable row-by-row recipe work continues on the worker clock after
              you close Pomade. Every completed row keeps its normal receipt.
            </DialogDescription>
          </DialogHeader>
          {runJobs.length ? (
            <div className="run-job-list">
              {runJobs.slice(0, 6).map((job) => {
                const processed = job.completedCount + job.skippedCount;
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
                          {processed} processed · {job.status}
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
                    {job.lastError ? (
                      <p className="run-job-error">{job.lastError}</p>
                    ) : null}
                    {canPauseRunJob(job) || canResumeRunJob(job) ? (
                      <div className="run-job-actions">
                        <span>
                          {job.skippedCount
                            ? `${job.skippedCount} deleted ${job.skippedCount === 1 ? 'row was' : 'rows were'} skipped.`
                            : 'The current row may finish before a pause takes effect.'}
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
                            {job.status === 'failed' ? 'Retry' : 'Resume'}
                          </Button>
                        )}
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
                    : workspace.schedule.enabled && workspace.schedule.nextRunAt
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
          {scheduledResearchActionCount > maximumResearchActions ? (
            <p className="schedule-error" role="alert">
              This scope allows up to {scheduledResearchActionCount} external
              requests. Choose a captured selection so each run stays at or
              below {maximumResearchActions}.
            </p>
          ) : scheduleError ? (
            <p className="schedule-error" role="alert">
              {scheduleError}
            </p>
          ) : null}
          <div className="schedule-actions">
            <p>
              Pomade checks for due work every minute. Failed schedules stop
              instead of spending credits repeatedly.
            </p>
            {workspace.schedule?.enabled ? (
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
          <div className="receipt-log">
            {currentReceipt?.receipts.slice(0, 100).map((receipt) => (
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
                            {attempt.status === 'passed'
                              ? 'accepted'
                              : attempt.error
                                ? 'provider error'
                                : 'not accepted'}{' '}
                            · {attempt.error || attempt.after || 'No result'} ·{' '}
                            {attempt.durationMs} ms ·{' '}
                            {attempt.creditsConsumed == null
                              ? 'cost unknown'
                              : `${attempt.creditsConsumed} credits`}
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
                          <a href={visit.url} target="_blank" rel="noreferrer">
                            {visit.title || visit.url}
                          </a>
                          {visit.error ? ` · ${visit.error}` : ''}
                          {visit.truncated ? ' · Page text was shortened' : ''}
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
                <strong>No runs yet</strong>
                <span>
                  Add a recipe column and run the grid to create the first
                  receipt.
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
                      disabled={Boolean(restoringVersionId)}
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
            setSourcePreview(undefined);
            setSourceError('');
          }
        }}
      >
        <DialogContent className="sources-dialog">
          <DialogHeader>
            <DialogTitle>Load data</DialogTitle>
            <DialogDescription>
              Preview contacts, companies, accounts or leads before importing
              them. This action only reads the CRM.
            </DialogDescription>
          </DialogHeader>
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
                disabled={jobLocksWorkspace}
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
                  <label>
                    Extra CRM properties (optional)
                    <input
                      aria-label={`${provider} extra properties`}
                      value={sourceFields[provider]}
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
                    disabled={!status.configured || Boolean(sourceLoading)}
                  >
                    {loading ? (
                      <LoaderCircle className="spin" />
                    ) : (
                      <RefreshCw />
                    )}
                    {loading ? 'Reading…' : 'Preview 50'}
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
              <div className="source-preview-actions">
                <p>
                  Append merges by CRM record ID and preserves recipe results.
                  Replace swaps the rows but keeps your recipe columns.
                </p>
                <Button
                  variant="outline"
                  onClick={() => importCrmPreview('replace')}
                  disabled={jobLocksWorkspace}
                >
                  Replace rows
                </Button>
                <Button
                  onClick={() => importCrmPreview('append')}
                  disabled={jobLocksWorkspace}
                >
                  Append records
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
              Rename the visible header without changing the stable column ID
              used by recipes, views, or row data.
            </DialogDescription>
          </DialogHeader>
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
              maxLength={80}
              onChange={(event) => setColumnEditorTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') renameColumn();
              }}
            />
          </label>
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
                  {runTargetIds.length} selected or visible{' '}
                  {runTargetIds.length === 1 ? 'row' : 'rows'} · existing
                  provider confirmation still applies
                </small>
              </span>
              <Button
                variant="outline"
                onClick={() => runEditedColumn('background')}
                disabled={
                  jobSaving || jobLocksWorkspace || !runTargetIds.length
                }
              >
                <Cloud /> Queue
              </Button>
              <Button
                onClick={() => runEditedColumn('immediate')}
                disabled={running || jobLocksWorkspace || !runTargetIds.length}
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
            <Button onClick={renameColumn} disabled={!columnEditorTitle.trim()}>
              Save name
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
