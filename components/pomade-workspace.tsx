'use client';

import {
  ArrowDownUp,
  Braces,
  Building2,
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
  LoaderCircle,
  MailCheck,
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
  Upload,
  WandSparkles,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Papa from 'papaparse';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
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
import { applyCrmImport, type CrmImportMode } from '@/lib/crm-import';
import { toControlTowerPreview } from '@/lib/control-tower-adapter';
import {
  countEligibleRecipeActions,
  recalculateAutomaticFormulas,
  renderCustomFormula,
} from '@/lib/local-recipe-engine';
import type {
  ApolloEnrichmentResult,
  CrmProvider,
  CrmSourcePreview,
  PomadeColumn,
  PomadeRow,
  RecipeRunCondition,
  RunReceipt,
  RunConditionOperator,
  WorkspaceSnapshot,
} from '@/lib/pomade-types';
import { createSampleWorkspace } from '@/lib/sample-workspace';

const PomadeDataGrid = dynamic(() => import('@/components/pomade-data-grid'), {
  ssr: false,
  loading: () => <div className="grid-loading">Shaping your workspace…</div>,
});

type FilterMode = 'All' | 'Ready' | 'Review';
type SaveState = 'Loading' | 'Saving' | 'Saved' | 'Offline';

type ApolloProviderStatus = {
  configured: boolean;
  capabilities: {
    personMatch: boolean;
    verifiedWorkEmail: boolean;
    phoneReveal: boolean;
  };
};

type ResearchProviderStatus = {
  provider: 'parallel' | 'gemini' | null;
  configured: boolean;
  label: string;
  model: string;
  capabilities: {
    webResearch: boolean;
    citations: boolean;
    maximumActionsPerRun: number;
  };
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

const conditionOperators: Array<{
  value: RunConditionOperator;
  label: string;
  needsValue: boolean;
}> = [
  { value: 'is_not_empty', label: 'is not empty', needsValue: false },
  { value: 'is_empty', label: 'is empty', needsValue: false },
  { value: 'equals', label: 'equals', needsValue: true },
  { value: 'not_equals', label: 'does not equal', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'not_contains', label: 'does not contain', needsValue: true },
];

function conditionNeedsValue(operator: RunConditionOperator) {
  return conditionOperators.find((item) => item.value === operator)?.needsValue;
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

function runTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

function providerLabel(run?: RunReceipt) {
  if (run?.provider === 'apollo') return 'Apollo';
  if (run?.provider === 'parallel') return 'Parallel research';
  if (run?.provider === 'gemini') return 'Gemini research';
  if (run?.provider === 'mixed')
    return run.researchProvider === 'parallel'
      ? 'Pomade + Parallel'
      : 'Pomade + Gemini';
  return 'Pomade runner';
}

function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <span>P</span>
    </span>
  );
}

export default function PomadeWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(() =>
    createSampleWorkspace(),
  );
  const [activeRowId, setActiveRowId] = useState('sample-1');
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [runHistory, setRunHistory] = useState<RunReceipt[]>([]);
  const [latestRun, setLatestRun] = useState<RunReceipt>();
  const [receiptRun, setReceiptRun] = useState<RunReceipt>();
  const [saveState, setSaveState] = useState<SaveState>('Loading');
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('All');
  const [query, setQuery] = useState('');
  const [sortAscending, setSortAscending] = useState(true);
  const [notice, setNotice] = useState('');

  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [formulaBuilderOpen, setFormulaBuilderOpen] = useState(false);
  const [recipeSettingsOpen, setRecipeSettingsOpen] = useState(false);
  const [researchBuilderOpen, setResearchBuilderOpen] = useState(false);
  const [researchConfirmOpen, setResearchConfirmOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState('');
  const [formulaColumnName, setFormulaColumnName] = useState('Personal label');
  const [formulaExpression, setFormulaExpression] = useState(
    '{{person | first}} at {{company}}',
  );

  const [apolloOpen, setApolloOpen] = useState(false);
  const [apolloRunning, setApolloRunning] = useState(false);
  const [apolloError, setApolloError] = useState('');
  const [apolloResult, setApolloResult] = useState<ApolloEnrichmentResult>();
  const [apolloStatus, setApolloStatus] = useState<ApolloProviderStatus>();
  const [researchStatus, setResearchStatus] =
    useState<ResearchProviderStatus>();
  const [researchColumnName, setResearchColumnName] = useState(
    'Recent company trigger',
  );
  const [researchPrompt, setResearchPrompt] = useState(DEFAULT_RESEARCH_PROMPT);
  const [pendingRunRowIds, setPendingRunRowIds] = useState<string[]>([]);

  const [crmCatalog, setCrmCatalog] =
    useState<CrmCatalogStatus>(emptyCrmCatalog);
  const [sourceLoading, setSourceLoading] = useState<CrmProvider>();
  const [sourceError, setSourceError] = useState('');
  const [sourcePreview, setSourcePreview] = useState<CrmSourcePreview>();

  const hydrated = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/workspace').then((response) => {
        if (!response.ok) throw new Error('Workspace failed to load');
        return response.json() as Promise<{ workspace: WorkspaceSnapshot }>;
      }),
      fetch('/api/runs?workspaceId=founder-targets').then((response) => {
        if (!response.ok) throw new Error('Runs failed to load');
        return response.json() as Promise<{ runs: RunReceipt[] }>;
      }),
      fetch('/api/providers/apollo')
        .then((response) => {
          if (!response.ok) throw new Error('Apollo status failed to load');
          return response.json() as Promise<ApolloProviderStatus>;
        })
        .catch(() => ({
          configured: false,
          capabilities: {
            personMatch: true,
            verifiedWorkEmail: true,
            phoneReveal: false,
          },
        })),
      fetch('/api/providers/crm')
        .then((response) => {
          if (!response.ok) throw new Error('CRM status failed to load');
          return response.json() as Promise<CrmCatalogStatus>;
        })
        .catch(() => emptyCrmCatalog),
      fetch('/api/providers/research')
        .then((response) => {
          if (!response.ok) throw new Error('Research status failed to load');
          return response.json() as Promise<ResearchProviderStatus>;
        })
        .catch(() => ({
          provider: null,
          configured: false,
          label: 'AI web research',
          model: 'No provider configured',
          capabilities: {
            webResearch: true,
            citations: true,
            maximumActionsPerRun: 10,
          },
        })),
    ])
      .then(([workspaceResponse, runsResponse, apollo, crm, research]) => {
        if (cancelled) return;
        setWorkspace(workspaceResponse.workspace);
        setActiveRowId(workspaceResponse.workspace.rows[0]?.id ?? '');
        setRunHistory(runsResponse.runs);
        setLatestRun(runsResponse.runs[0]);
        setApolloStatus(apollo);
        setCrmCatalog(crm);
        setResearchStatus(research);
        setSaveState('Saved');
        hydrated.current = true;
      })
      .catch(() => {
        if (!cancelled) {
          setSaveState('Offline');
          hydrated.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    setSaveState('Saving');
    const timer = window.setTimeout(() => {
      fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace }),
      })
        .then((response) => {
          if (!response.ok) throw new Error('Save failed');
          setSaveState('Saved');
        })
        .catch(() => setSaveState('Offline'));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [workspace]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspace.rows.filter((row) => {
      const matchesStatus = filter === 'All' || row.values.status === filter;
      const matchesQuery =
        !needle ||
        Object.values(row.values).some((value) =>
          value.toLowerCase().includes(needle),
        );
      return matchesStatus && matchesQuery;
    });
  }, [filter, query, workspace.rows]);

  const selected =
    workspace.rows.find((row) => row.id === activeRowId) ?? workspace.rows[0];
  const selectedValues = selected?.values ?? {};
  const readyCount = workspace.rows.filter(
    (row) => row.values.status === 'Ready',
  ).length;
  const reviewCount = workspace.rows.filter(
    (row) => row.values.status === 'Review',
  ).length;
  const recipeColumns = workspace.columns.filter(
    (column) => column.kind === 'formula' || column.kind === 'enrichment',
  );
  const recipeCount = recipeColumns.length;
  const conditionCount = recipeColumns.filter(
    (column) => column.runCondition,
  ).length;
  const automaticFormulaCount = recipeColumns.filter(
    (column) => column.kind === 'formula' && column.autoRun,
  ).length;
  const webResearchColumns = workspace.columns.filter(
    (column) => column.recipe === 'web-research',
  );
  const connectedCount = [
    apolloStatus?.configured,
    researchStatus?.configured,
    crmCatalog.providers.hubspot.configured,
    crmCatalog.providers.salesforce.configured,
  ].filter(Boolean).length;
  const pendingResearchActionCount = useMemo(() => {
    const pending = new Set(pendingRunRowIds);
    return countEligibleRecipeActions(
      workspace.rows.filter((row) => pending.has(row.id)),
      webResearchColumns,
    );
  }, [pendingRunRowIds, webResearchColumns, workspace.rows]);
  const maximumResearchActions =
    researchStatus?.capabilities.maximumActionsPerRun ?? 10;
  const selectedReceipts = runHistory
    .flatMap((run) => run.receipts)
    .filter((receipt) => receipt.rowId === selected?.id)
    .slice(0, 6);
  const runTargetIds = selectedRowIds.length
    ? selectedRowIds
    : visibleRows.map((row) => row.id);
  const currentReceipt = receiptRun ?? latestRun;
  const handoffRowIds = selectedRowIds.length
    ? selectedRowIds
    : selected
      ? [selected.id]
      : [];
  const handoffPlan = useMemo(
    () => toControlTowerPreview(workspace, handoffRowIds),
    [handoffRowIds, workspace],
  );

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
      return { ...current, columns, rows, updatedAt: Date.now() };
    });
    setAddColumnOpen(false);
    setNotice(
      preset.kind === 'formula' && preset.autoRun
        ? `${preset.title} is live and will update with its inputs.`
        : `${preset.title} is ready to run.`,
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

  function openResearchBuilder() {
    setAddColumnOpen(false);
    setResearchColumnName('Recent company trigger');
    setResearchPrompt(DEFAULT_RESEARCH_PROMPT);
    setResearchBuilderOpen(true);
  }

  function openFormulaBuilder() {
    setAddColumnOpen(false);
    setFormulaColumnName('Personal label');
    setFormulaExpression('{{person | first}} at {{company}}');
    setFormulaBuilderOpen(true);
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

  function addWebResearchColumn() {
    const title = researchColumnName.trim();
    const prompt = researchPrompt.trim();
    if (!title || !prompt) return;
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
    setFilter((current) =>
      current === 'All' ? 'Ready' : current === 'Ready' ? 'Review' : 'All',
    );
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
          updatedAt: Date.now(),
          source: {
            provider: 'csv',
            label: file.name,
            importedAt: Date.now(),
          },
        };
        setWorkspace(next);
        setActiveRowId(rows[0]?.id ?? '');
        setSelectedRowIds([]);
        setFilter('All');
        setQuery('');
        setSourcesOpen(false);
        setNotice(`${rows.length} CSV rows loaded.`);
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

  function downloadControlTowerPlan() {
    const blob = new Blob([JSON.stringify(handoffPlan, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slugify(workspace.name)}_control_tower_preview.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(
      `${handoffPlan.records.length} rows packaged for Control Tower preview.`,
    );
    setHandoffOpen(false);
  }

  function resetSample() {
    if (!window.confirm('Reset this table to the Pomade sample workspace?'))
      return;
    const sample = createSampleWorkspace();
    setWorkspace(sample);
    setActiveRowId(sample.rows[0]?.id ?? '');
    setSelectedRowIds([]);
    setFilter('All');
    setQuery('');
    setNotice('Sample workspace restored.');
  }

  function openApollo() {
    setApolloError('');
    setApolloResult(undefined);
    setApolloOpen(true);
  }

  function rememberRun(run: RunReceipt) {
    setLatestRun(run);
    setRunHistory((current) =>
      [run, ...current.filter((item) => item.id !== run.id)].slice(0, 10),
    );
  }

  async function enrichSelectedWithApollo() {
    if (!selected || apolloRunning) return;
    setApolloRunning(true);
    setApolloError('');
    setApolloResult(undefined);
    try {
      const response = await fetch('/api/providers/apollo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace, rowId: selected.id }),
      });
      const result = (await response.json()) as {
        workspace?: WorkspaceSnapshot;
        run?: RunReceipt;
        enrichment?: ApolloEnrichmentResult;
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
      setWorkspace(result.workspace);
      rememberRun(result.run);
      setApolloResult(result.enrichment);
      setSaveState('Saved');
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
  ) {
    if (running || rowIds.length === 0) return;
    const target = new Set(rowIds);
    const eligibleResearchActions = countEligibleRecipeActions(
      workspace.rows.filter((row) => target.has(row.id)),
      webResearchColumns,
    );
    if (eligibleResearchActions > 0 && !confirmExternalResearch) {
      setPendingRunRowIds(rowIds);
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
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspace,
          rowIds,
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
      setWorkspace(result.workspace);
      rememberRun(result.run);
      setSaveState('Saved');
      const skipped = result.run.skippedCount ?? 0;
      setNotice(
        `${result.run.actionCount} actions finished across ${result.run.rowCount} rows${skipped ? ` · ${skipped} skipped by rules` : ''}.`,
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

  async function previewCrmSource(provider: CrmProvider) {
    setSourceLoading(provider);
    setSourceError('');
    setSourcePreview(undefined);
    try {
      const response = await fetch('/api/providers/crm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, limit: 50 }),
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
    const next = applyCrmImport(workspace, sourcePreview, mode);
    setWorkspace(next);
    setActiveRowId(next.rows[0]?.id ?? '');
    setSelectedRowIds([]);
    setFilter('All');
    setQuery('');
    setSourcesOpen(false);
    setNotice(
      `${sourcePreview.contacts.length} ${sourcePreview.sourceLabel.toLowerCase()} ${
        mode === 'append' ? 'merged into' : 'loaded into'
      } the grid.`,
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

  return (
    <main className="pomade-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <LogoMark />
          <span className="brand-name">Pomade</span>
          <span className="crumb">/</span>
          <button className="workspace-name" type="button" onClick={openRename}>
            {workspace.name} <ChevronDown />
          </button>
        </div>
        <div className="topbar-actions">
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
              onClick={() => setSourcesOpen(true)}
            >
              <Database /> Sources <span>{connectedCount}/4</span>
            </button>
          </nav>
          <p className="sidebar-label sidebar-label-spaced">Saved views</p>
          <nav aria-label="Saved views">
            <button
              className={`nav-item ${filter === 'Ready' ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setSelectedRowIds([]);
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
                setFilter(filter === 'Review' ? 'All' : 'Review');
              }}
            >
              <Search /> Needs review <span>{reviewCount}</span>
            </button>
          </nav>
          <button
            className="new-table"
            type="button"
            onClick={() => setAddColumnOpen(true)}
          >
            <Plus /> Add recipe column
          </button>
          <button
            className="engine-card"
            type="button"
            onClick={() => setRecipeSettingsOpen(true)}
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
              >
                <Upload /> Load data
              </Button>
              <span className="toolbar-divider" />
              <span className="toolbar-stat">
                <Rows3 /> {visibleRows.length} rows
              </span>
              <Button variant="ghost" onClick={() => setAddColumnOpen(true)}>
                <Columns3 /> {workspace.columns.length} columns
              </Button>
              <Button variant="ghost" onClick={sortRows}>
                <ArrowDownUp /> Sort
              </Button>
              <Button
                variant={filter === 'All' ? 'ghost' : 'secondary'}
                onClick={cycleFilter}
              >
                <Filter /> {filter === 'All' ? 'Filter' : filter}
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
                  <DropdownMenuItem onClick={addBlankRow}>
                    <Plus /> Add blank row
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openApollo} disabled={!selected}>
                    <MailCheck /> Enrich active row with Apollo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openResearchBuilder}>
                    <Globe2 /> Add AI web research
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRecipeSettingsOpen(true)}>
                    <SlidersHorizontal /> Recipe run settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportCsv}>
                    <Download /> Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setHandoffOpen(true)}
                    disabled={!handoffPlan.records.length}
                  >
                    <ShieldCheck /> Prepare CRM handoff
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={resetSample}>
                    <RotateCcw /> Restore sample data
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                className="run-button"
                onClick={() => runEnrichment()}
                disabled={
                  running || runTargetIds.length === 0 || recipeCount === 0
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
              onRowsChange={updateVisibleRows}
              onActiveRowChange={setActiveRowId}
              onSelectedRowIdsChange={updateSelectedRows}
            />
            {notice ? (
              <div className="workspace-toast" role="status">
                <Check /> {notice}
              </div>
            ) : null}
          </div>

          <footer className="statusbar">
            <span>
              <span
                className={`status-dot ${saveState === 'Offline' ? 'status-dot-warning' : ''}`}
              />{' '}
              {saveState === 'Offline'
                ? 'Working locally'
                : 'Changes persist automatically'}
            </span>
            <span>
              {workspace.rows.length} records · {recipeCount} recipes
            </span>
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
            disabled={!selected}
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
            className="row-run-action"
            type="button"
            onClick={() => selected && runEnrichment([selected.id])}
            disabled={!selected || running || recipeCount === 0}
          >
            <Play /> Run recipes for this row
          </button>
          <button
            className="row-run-action"
            type="button"
            onClick={() => setHandoffOpen(true)}
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

      <Dialog open={addColumnOpen} onOpenChange={setAddColumnOpen}>
        <DialogContent className="recipe-dialog">
          <DialogHeader>
            <DialogTitle>Add a recipe column</DialogTitle>
            <DialogDescription>
              Add a reusable transformation or research step. Results stay
              editable after every run.
            </DialogDescription>
          </DialogHeader>
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
                      {column.kind === 'formula' ? (
                        <FunctionSquare />
                      ) : (
                        <Sparkles />
                      )}
                    </span>
                    <div>
                      <strong>{column.title}</strong>
                      <small>
                        {column.kind === 'formula'
                          ? 'Deterministic formula'
                          : column.recipe === 'web-research'
                            ? 'Credit-gated web research'
                            : 'Manual enrichment'}
                      </small>
                    </div>
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
                  <div className="condition-builder">
                    <span>Only run if</span>
                    <select
                      value={condition?.field ?? ''}
                      aria-label={`Condition field for ${column.title}`}
                      onChange={(event) => {
                        const field = event.target.value;
                        const nextCondition: RecipeRunCondition | undefined =
                          field
                            ? { field, operator: 'is_not_empty' }
                            : undefined;
                        updateRecipeColumn(column.id, {
                          runCondition: nextCondition,
                        });
                      }}
                    >
                      <option value="">Always run</option>
                      {availableInputs.map((input) => (
                        <option value={input.id} key={input.id}>
                          {input.title}
                        </option>
                      ))}
                    </select>
                    {condition ? (
                      <select
                        value={condition.operator}
                        aria-label={`Condition operator for ${column.title}`}
                        onChange={(event) => {
                          const operator = event.target
                            .value as RunConditionOperator;
                          updateRecipeColumn(column.id, {
                            runCondition: {
                              ...condition,
                              operator,
                              value: conditionNeedsValue(operator)
                                ? condition.value
                                : undefined,
                            },
                          });
                        }}
                      >
                        {conditionOperators.map((operator) => (
                          <option value={operator.value} key={operator.value}>
                            {operator.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {condition && conditionNeedsValue(condition.operator) ? (
                      <input
                        value={condition.value ?? ''}
                        aria-label={`Condition value for ${column.title}`}
                        placeholder="Value"
                        onChange={(event) =>
                          updateRecipeColumn(column.id, {
                            runCondition: {
                              ...condition,
                              value: event.target.value,
                            },
                          })
                        }
                      />
                    ) : null}
                  </div>
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

      <Dialog open={researchBuilderOpen} onOpenChange={setResearchBuilderOpen}>
        <DialogContent className="research-builder-dialog">
          <DialogHeader>
            <DialogTitle>Add AI web research</DialogTitle>
            <DialogDescription>
              Create a Claygent-style column that asks a row-specific question,
              searches the live web, and keeps its source links.
            </DialogDescription>
          </DialogHeader>
          <div className="research-provider-state">
            <span className="source-logo source-logo-gemini">
              <Globe2 />
            </span>
            <div>
              <strong>{researchStatus?.label ?? 'AI web research'}</strong>
              <small>{researchStatus?.model ?? 'Checking provider…'}</small>
            </div>
            <span
              className={`connection-badge ${researchStatus?.configured ? 'connection-ready' : ''}`}
            >
              {researchStatus?.configured ? 'Key ready' : 'Add key locally'}
            </span>
          </div>
          <label className="research-field">
            <span>Output column</span>
            <input
              value={researchColumnName}
              maxLength={80}
              onChange={(event) => setResearchColumnName(event.target.value)}
              placeholder="Recent company trigger"
            />
          </label>
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
              Your API key stays server-side. Results and citations are saved
              with the workspace receipt.
            </p>
            <Button
              variant="outline"
              onClick={() => setResearchBuilderOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={addWebResearchColumn}
              disabled={!researchColumnName.trim() || !researchPrompt.trim()}
            >
              <Plus /> Add research column
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={researchConfirmOpen} onOpenChange={setResearchConfirmOpen}>
        <DialogContent className="research-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Run grounded web research?</DialogTitle>
            <DialogDescription>
              {researchStatus?.label ?? 'Your configured provider'} will search
              the live web for each row and research column. Each request may
              consume provider credits.
            </DialogDescription>
          </DialogHeader>
          <div className="research-run-summary">
            <div>
              <span>Rows</span>
              <strong>{pendingRunRowIds.length}</strong>
            </div>
            <div>
              <span>Research columns</span>
              <strong>{webResearchColumns.length}</strong>
            </div>
            <div>
              <span>Maximum requests</span>
              <strong>{pendingResearchActionCount}</strong>
            </div>
          </div>
          {!researchStatus?.configured ? (
            <p className="research-warning" role="alert">
              Add PARALLEL_API_KEY or GEMINI_API_KEY to .env.local and restart
              Pomade before this run.
            </p>
          ) : pendingResearchActionCount > maximumResearchActions ? (
            <p className="research-warning" role="alert">
              This first slice allows {maximumResearchActions} research requests
              per run. Select fewer rows or remove a research column.
            </p>
          ) : (
            <p className="research-safety">
              Pomade sends the rendered prompt and visible row context. It
              stores the answer, search queries, source URLs, and a receipt.
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
                setResearchConfirmOpen(false);
                setPendingRunRowIds([]);
                void runEnrichment(rowIds, true);
              }}
              disabled={
                !researchStatus?.configured ||
                pendingResearchActionCount === 0 ||
                pendingResearchActionCount > maximumResearchActions
              }
            >
              <Globe2 /> Research {pendingRunRowIds.length} rows
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
                  {receipt.references?.length ? (
                    <span className="receipt-sources">
                      {receipt.references.slice(0, 3).map((reference) => (
                        <a
                          key={reference.url}
                          href={reference.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {reference.title}
                        </a>
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
              Preview a source before it changes the grid. CRM connections are
              read-only.
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
              <button type="button" onClick={() => fileInput.current?.click()}>
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
                    <small>{status.label}</small>
                  </div>
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

          <div className="enrichment-connection">
            <span className="source-logo source-logo-gemini">
              <Globe2 />
            </span>
            <div>
              <strong>AI web research</strong>
              <small>
                {researchStatus?.configured
                  ? `${researchStatus.label} + source citations`
                  : 'Parallel or Gemini + source citations'}
              </small>
            </div>
            <span
              className={`connection-badge ${researchStatus?.configured ? 'connection-ready' : ''}`}
            >
              {researchStatus?.configured ? 'Connected' : 'Not configured'}
            </span>
          </div>

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
                    <span>{contact.fullName || 'Unnamed record'}</span>
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
                >
                  Replace rows
                </Button>
                <Button onClick={() => importCrmPreview('append')}>
                  Append records
                </Button>
              </div>
            </section>
          ) : null}
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
              autoFocus
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
              Package the selected rows for GTM Control Tower to preview and
              approve. Pomade will not write to either CRM.
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
                <small>Preview, approve, receipt, rollback</small>
              </span>
            </div>
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
              <span>Maximum</span>
              <strong>{handoffPlan.guards.maxRecords} rows</strong>
            </div>
          </div>
          <div className="handoff-list">
            {handoffPlan.records.slice(0, 5).map((record) => (
              <div key={record.rowId}>
                <span>
                  {record.proposedFields.company ||
                    record.proposedFields.person ||
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
              disabled={!handoffPlan.records.length}
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
              Enrich {selectedValues.person || 'selected person'} with Apollo
            </DialogTitle>
            <DialogDescription>
              Match this person at their current company and return a verified
              business profile.
            </DialogDescription>
          </DialogHeader>
          <div className="apollo-target">
            <div>
              <span>Person</span>
              <strong>{selectedValues.person || 'Missing person name'}</strong>
            </div>
            <div>
              <span>Company</span>
              <strong>{selectedValues.company || 'Unknown company'}</strong>
            </div>
            <div>
              <span>Domain</span>
              <strong>
                {selectedValues.domain || 'Missing company domain'}
              </strong>
            </div>
          </div>
          <div className="apollo-safety">
            <ShieldCheck />
            <div>
              <strong>
                {apolloStatus?.configured
                  ? 'Apollo key is configured'
                  : 'Apollo key is not configured'}
              </strong>
              <p>
                This action sends the person name and company domain to Apollo.
                It may use up to 1 Apollo credit when data is found. Personal
                emails and phone numbers stay off.
              </p>
            </div>
          </div>
          {apolloResult ? (
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
                !selectedValues.person ||
                !selectedValues.domain
              }
            >
              {apolloRunning ? (
                <LoaderCircle className="spin" />
              ) : (
                <MailCheck />
              )}
              {apolloRunning ? 'Checking Apollo…' : 'Use up to 1 credit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
