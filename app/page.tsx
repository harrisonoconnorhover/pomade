'use client';

import {
  ArrowDownUp,
  Braces,
  Check,
  ChevronDown,
  CirclePlay,
  Cloud,
  Columns3,
  Database,
  Download,
  Filter,
  FlaskConical,
  FunctionSquare,
  LoaderCircle,
  MailCheck,
  MoreHorizontal,
  PanelLeftClose,
  Phone,
  Plus,
  Rows3,
  Search,
  ShieldCheck,
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
import type {
  ApolloEnrichmentResult,
  PomadeColumn,
  PomadeRow,
  RunReceipt,
  WorkspaceSnapshot,
} from '@/lib/pomade-types';
import { createSampleWorkspace } from '@/lib/sample-workspace';

const PomadeDataGrid = dynamic(() => import('@/components/pomade-data-grid'), {
  ssr: false,
  loading: () => <div className="grid-loading">Shaping your workspace…</div>,
});

type FilterMode = 'All' | 'Ready' | 'Review';

type ApolloProviderStatus = {
  configured: boolean;
  capabilities: {
    personMatch: boolean;
    verifiedWorkEmail: boolean;
    phoneReveal: boolean;
  };
};

const recipePresets: Array<Pick<PomadeColumn, 'title' | 'kind' | 'recipe' | 'width'>> = [
  { title: 'Normalized domain', kind: 'formula', recipe: 'normalize-domain', width: 190 },
  { title: 'ICP fit', kind: 'enrichment', recipe: 'score-fit', width: 180 },
  { title: 'Personal opener', kind: 'enrichment', recipe: 'write-opener', width: 330 },
  { title: 'Company summary', kind: 'enrichment', recipe: 'company-summary', width: 300 },
];

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'column';
}

function canonicalColumnId(header: string) {
  const slug = slugify(header);
  if (['company', 'company_name', 'account', 'account_name'].includes(slug)) return 'company';
  if (['person', 'name', 'full_name', 'contact', 'contact_name'].includes(slug)) return 'person';
  if (['title', 'job_title', 'role'].includes(slug)) return 'title';
  if (['domain', 'website', 'company_website', 'company_domain'].includes(slug)) return 'domain';
  return slug;
}

function uniqueId(base: string, used: Set<string>) {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

function LogoMark() {
  return <span className="logo-mark" aria-hidden="true"><span>P</span></span>;
}

export default function Home() {
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(() => createSampleWorkspace());
  const [activeRowId, setActiveRowId] = useState('sample-1');
  const [latestRun, setLatestRun] = useState<RunReceipt>();
  const [saveState, setSaveState] = useState<'Loading' | 'Saving' | 'Saved' | 'Offline'>('Loading');
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('All');
  const [query, setQuery] = useState('');
  const [sortAscending, setSortAscending] = useState(true);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [apolloOpen, setApolloOpen] = useState(false);
  const [apolloRunning, setApolloRunning] = useState(false);
  const [apolloError, setApolloError] = useState('');
  const [apolloResult, setApolloResult] = useState<ApolloEnrichmentResult>();
  const [apolloStatus, setApolloStatus] = useState<ApolloProviderStatus>();
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
          capabilities: { personMatch: true, verifiedWorkEmail: true, phoneReveal: false },
        })),
    ])
      .then(([workspaceResponse, runsResponse, providerStatus]) => {
        if (cancelled) return;
        setWorkspace(workspaceResponse.workspace);
        setActiveRowId(workspaceResponse.workspace.rows[0]?.id ?? '');
        setLatestRun(runsResponse.runs[0]);
        setApolloStatus(providerStatus);
        setSaveState('Saved');
        hydrated.current = true;
      })
      .catch(() => {
        if (!cancelled) {
          setSaveState('Offline');
          hydrated.current = true;
        }
      });
    return () => { cancelled = true; };
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

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspace.rows.filter((row) => {
      const matchesStatus = filter === 'All' || row.values.status === filter;
      const matchesQuery = !needle || Object.values(row.values).some((value) => value.toLowerCase().includes(needle));
      return matchesStatus && matchesQuery;
    });
  }, [filter, query, workspace.rows]);

  const selected = workspace.rows.find((row) => row.id === activeRowId) ?? workspace.rows[0];
  const selectedValues = selected?.values ?? {};
  const readyCount = workspace.rows.filter((row) => row.values.status === 'Ready').length;
  const selectedReceipts = latestRun?.receipts.filter((receipt) => receipt.rowId === selected?.id) ?? [];

  const updateVisibleRows = useCallback((changedRows: PomadeRow[]) => {
    const changedById = new Map(changedRows.map((row) => [row.id, row]));
    setWorkspace((current) => ({
      ...current,
      rows: current.rows.map((row) => changedById.get(row.id) ?? row),
      updatedAt: Date.now(),
    }));
  }, []);

  function addRecipeColumn(preset: (typeof recipePresets)[number]) {
    const used = new Set(workspace.columns.map((column) => column.id));
    const id = uniqueId(slugify(preset.title), used);
    setWorkspace((current) => ({
      ...current,
      columns: [...current.columns.filter((column) => column.kind !== 'status'), { id, ...preset }, ...current.columns.filter((column) => column.kind === 'status')],
      rows: current.rows.map((row) => ({ ...row, values: { ...row.values, [id]: '' } })),
      updatedAt: Date.now(),
    }));
    setAddColumnOpen(false);
  }

  function addBlankRow() {
    const id = crypto.randomUUID();
    setWorkspace((current) => ({
      ...current,
      rows: [...current.rows, { id, values: Object.fromEntries(current.columns.map((column) => [column.id, ''])) }],
      updatedAt: Date.now(),
    }));
    setActiveRowId(id);
  }

  function sortRows() {
    setWorkspace((current) => ({
      ...current,
      rows: [...current.rows].sort((a, b) => {
        const result = (a.values.company ?? '').localeCompare(b.values.company ?? '');
        return sortAscending ? result : -result;
      }),
      updatedAt: Date.now(),
    }));
    setSortAscending((current) => !current);
  }

  function cycleFilter() {
    setFilter((current) => (current === 'All' ? 'Ready' : current === 'Ready' ? 'Review' : 'All'));
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
        const columns: PomadeColumn[] = mappings.map(({ header, id }) => ({ id, title: header, kind: 'text', width: Math.max(150, Math.min(280, header.length * 10 + 80)) }));
        if (!used.has('status')) columns.push({ id: 'status', title: 'Run status', kind: 'status', width: 140 });
        const rows = data.map((record) => ({
          id: crypto.randomUUID(),
          values: Object.fromEntries([
            ...mappings.map(({ header, id }) => [id, String(record[header] ?? '')]),
            ['status', 'Imported'],
          ]),
        }));
        const next = { ...workspace, name: file.name.replace(/\.csv$/i, '') || 'Imported table', columns, rows, updatedAt: Date.now() };
        setWorkspace(next);
        setActiveRowId(rows[0]?.id ?? '');
        setFilter('All');
        setQuery('');
      },
    });
  }

  function exportCsv() {
    const records = workspace.rows.map((row) => Object.fromEntries(workspace.columns.map((column) => [column.title, row.values[column.id] ?? ''])));
    const blob = new Blob([Papa.unparse(records)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slugify(workspace.name)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openApollo() {
    setApolloError('');
    setApolloResult(undefined);
    setApolloOpen(true);
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
      if (!response.ok || !result.workspace || !result.run || !result.enrichment) {
        throw new Error(result.error || 'Apollo enrichment failed.');
      }
      setWorkspace(result.workspace);
      setLatestRun(result.run);
      setApolloResult(result.enrichment);
      setSaveState('Saved');
    } catch (error) {
      setApolloError(error instanceof Error ? error.message : 'Apollo enrichment failed.');
    } finally {
      setApolloRunning(false);
    }
  }

  async function runEnrichment() {
    if (running || workspace.rows.length === 0) return;
    setRunning(true);
    setWorkspace((current) => ({
      ...current,
      rows: current.rows.map((row) => ({ ...row, values: { ...row.values, status: 'Running' } })),
    }));
    try {
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace }),
      });
      if (!response.ok) throw new Error('Run failed');
      const result = (await response.json()) as { workspace: WorkspaceSnapshot; run: RunReceipt };
      setWorkspace(result.workspace);
      setLatestRun(result.run);
      setSaveState('Saved');
    } catch {
      setWorkspace((current) => ({
        ...current,
        rows: current.rows.map((row) => ({ ...row, values: { ...row.values, status: 'Review' } })),
      }));
      setSaveState('Offline');
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="pomade-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <LogoMark />
          <span className="brand-name">Pomade</span>
          <span className="crumb">/</span>
          <button className="workspace-name" type="button">{workspace.name} <ChevronDown /></button>
        </div>
        <div className="topbar-actions">
          <button className={`sync-state sync-${saveState.toLowerCase()}`} type="button">
            {saveState === 'Saving' ? <LoaderCircle className="spin" /> : <Cloud />} {saveState}
          </button>
          <Button variant="ghost" size="icon" aria-label="Workspace menu"><MoreHorizontal /></Button>
          <div className={`usage-pill ${apolloStatus?.configured ? 'usage-pill-connected' : ''}`}>
            {apolloStatus?.configured ? <MailCheck /> : <Sparkles />}
            {apolloStatus?.configured ? 'Apollo configured' : 'Safe demo runner'}
          </div>
          <div className="avatar" aria-label="Harrison account">H</div>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="sidebar">
          <Button variant="ghost" size="icon-sm" className="sidebar-collapse" aria-label="Collapse sidebar"><PanelLeftClose /></Button>
          <p className="sidebar-label">Workspace</p>
          <nav aria-label="Workspace navigation">
            <button className="nav-item active" type="button"><Table2 /> {workspace.name} <span>{workspace.rows.length}</span></button>
            <button className="nav-item" type="button"><FlaskConical /> Experiments <span>1</span></button>
            <button className="nav-item" type="button"><Database /> Sources <span>CSV</span></button>
          </nav>
          <p className="sidebar-label sidebar-label-spaced">Saved views</p>
          <nav aria-label="Saved views">
            <button className={`nav-item ${filter === 'Ready' ? 'active' : ''}`} type="button" onClick={() => setFilter(filter === 'Ready' ? 'All' : 'Ready')}><Check /> Ready to use <span>{readyCount}</span></button>
            <button className={`nav-item ${filter === 'Review' ? 'active' : ''}`} type="button" onClick={() => setFilter(filter === 'Review' ? 'All' : 'Review')}><Search /> Needs review <span>{workspace.rows.length - readyCount}</span></button>
          </nav>
          <button className="new-table" type="button" onClick={() => setAddColumnOpen(true)}><Plus /> Add recipe column</button>
          <div className="engine-card">
            <span className="engine-icon"><Braces /></span>
            <div><strong>Scoutbound</strong><span>Adapter contract ready</span></div>
            <span className="live-dot" />
          </div>
        </aside>

        <section className="grid-workspace">
          <div className="table-toolbar">
            <div className="toolbar-cluster">
              <input ref={fileInput} className="file-input" type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && importCsv(event.target.files[0])} />
              <Button variant="outline" size="lg" onClick={() => fileInput.current?.click()}><Upload /> Load CSV</Button>
              <span className="toolbar-divider" />
              <Button variant="ghost"><Rows3 /> {visibleRows.length} rows</Button>
              <Button variant="ghost" onClick={() => setAddColumnOpen(true)}><Columns3 /> {workspace.columns.length} columns</Button>
              <Button variant="ghost" onClick={sortRows}><ArrowDownUp /> Sort</Button>
              <Button variant={filter === 'All' ? 'ghost' : 'secondary'} onClick={cycleFilter}><Filter /> {filter === 'All' ? 'Filter' : filter}</Button>
              <label className="toolbar-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></label>
            </div>
            <div className="toolbar-cluster">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" />}>Action <ChevronDown /></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={addBlankRow}><Plus /> Add blank row</DropdownMenuItem>
                  <DropdownMenuItem onClick={openApollo}><MailCheck /> Enrich selected with Apollo</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportCsv}><Download /> Export CSV</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button className="run-button" onClick={runEnrichment} disabled={running || workspace.rows.length === 0}>
                {running ? <LoaderCircle className="spin" /> : <WandSparkles />} {running ? 'Running…' : 'Run enrichment'}
              </Button>
            </div>
          </div>

          <div className="grid-frame">
            <PomadeDataGrid columns={workspace.columns} rows={visibleRows} onRowsChange={updateVisibleRows} onActiveRowChange={setActiveRowId} />
          </div>

          <footer className="statusbar">
            <span><span className={`status-dot ${saveState === 'Offline' ? 'status-dot-warning' : ''}`} /> {saveState === 'Offline' ? 'Working locally' : 'Changes persist automatically'}</span>
            <span>{workspace.rows.length} records · {workspace.columns.length} fields</span>
            <span>Grid by Glide Data Grid</span>
          </footer>
        </section>

        <aside className="inspector">
          <div className="inspector-heading">
            <div><p>Selected record</p><h2>{selectedValues.company || 'Untitled row'}</h2></div>
            <Button variant="ghost" size="icon-sm"><MoreHorizontal /></Button>
          </div>
          <div className="record-avatar">{(selectedValues.company || '?').slice(0, 1)}</div>
          <div className="record-person">
            <strong>{selectedValues.person || 'No person yet'}</strong>
            <span>{selectedValues.title || 'No title'}</span>
            {selectedValues.domain ? <a href={`https://${selectedValues.domain}`}>{selectedValues.domain}</a> : null}
          </div>
          <button className="apollo-action" type="button" onClick={openApollo} disabled={!selected}>
            <span><MailCheck /></span>
            <div><strong>Enrich with Apollo</strong><small>Person match + verified work email</small></div>
            <Sparkles />
          </button>
          <div className="inspector-section">
            <div className="section-title"><span>Recipe trace</span><span>{selectedReceipts.length} steps</span></div>
            {selectedReceipts.length ? (
              <ol className="recipe-list">
                {selectedReceipts.slice(0, 5).map((receipt) => (
                  <li key={receipt.id}><span><Check /></span><div><strong>{receipt.action}</strong><small>{receipt.status} · {receipt.durationMs} ms</small></div></li>
                ))}
              </ol>
            ) : <p className="empty-trace">Run enrichment to generate a field-by-field receipt.</p>}
          </div>
          <div className="receipt-card">
            <div className="receipt-title"><CirclePlay /><span>Latest receipt</span><strong>{latestRun ? 'Passed' : 'Waiting'}</strong></div>
            <p>{latestRun ? `${latestRun.actionCount} actions completed across ${latestRun.rowCount} rows. No external records were written.` : 'Every run will record its inputs, outputs and review state here.'}</p>
            <button type="button" onClick={() => setReceiptOpen(true)} disabled={!latestRun}>View run details →</button>
          </div>
        </aside>
      </div>

      <Dialog open={addColumnOpen} onOpenChange={setAddColumnOpen}>
        <DialogContent className="recipe-dialog">
          <DialogHeader>
            <DialogTitle>Add a recipe column</DialogTitle>
            <DialogDescription>Choose what Pomade should calculate for every row. You can edit the result after it runs.</DialogDescription>
          </DialogHeader>
          <div className="recipe-presets">
            {recipePresets.map((preset) => (
              <button key={`${preset.recipe}-${preset.title}`} type="button" onClick={() => addRecipeColumn(preset)}>
                <span className={preset.kind === 'formula' ? 'formula-preset' : 'ai-preset'}>{preset.kind === 'formula' ? <FunctionSquare /> : <Sparkles />}</span>
                <div><strong>{preset.title}</strong><small>{preset.kind === 'formula' ? 'Deterministic formula' : 'Enrichment recipe'}</small></div>
                <Plus />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="receipt-dialog">
          <DialogHeader>
            <DialogTitle>Run receipt</DialogTitle>
            <DialogDescription>{latestRun ? `${latestRun.actionCount} actions · ${latestRun.passedCount} passed · ${latestRun.reviewCount} rows need review` : 'No run yet.'}</DialogDescription>
          </DialogHeader>
          <div className="receipt-summary">
            <div><span>Rows</span><strong>{latestRun?.rowCount ?? 0}</strong></div>
            <div><span>Actions</span><strong>{latestRun?.actionCount ?? 0}</strong></div>
            <div><span>External writes</span><strong>{latestRun?.externalWrites ?? 0}</strong></div>
          </div>
          <div className="receipt-log">
            {latestRun?.receipts.slice(0, 20).map((receipt) => (
              <div key={receipt.id}><span className="receipt-pass"><Check /></span><div><strong>{receipt.rowLabel} · {receipt.action}</strong><small>{receipt.after || 'No output'} · {receipt.durationMs} ms</small></div></div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={apolloOpen} onOpenChange={setApolloOpen}>
        <DialogContent className="apollo-dialog">
          <DialogHeader>
            <DialogTitle>Enrich {selectedValues.person || 'selected person'} with Apollo</DialogTitle>
            <DialogDescription>
              Match this person at their current company and return a verified business profile.
            </DialogDescription>
          </DialogHeader>

          <div className="apollo-target">
            <div><span>Person</span><strong>{selectedValues.person || 'Missing person name'}</strong></div>
            <div><span>Company</span><strong>{selectedValues.company || 'Unknown company'}</strong></div>
            <div><span>Domain</span><strong>{selectedValues.domain || 'Missing company domain'}</strong></div>
          </div>

          <div className="apollo-safety">
            <ShieldCheck />
            <div>
              <strong>{apolloStatus?.configured ? 'Apollo key is configured' : 'Apollo key is not configured'}</strong>
              <p>
                This action sends the person name and company domain to Apollo. It may use up to 1
                Apollo credit when data is found. Personal emails and phone numbers stay off.
              </p>
            </div>
          </div>

          {apolloResult ? (
            <div className={`apollo-result apollo-result-${apolloResult.status}`}>
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

          {apolloError ? <p className="apollo-error" role="alert">{apolloError}</p> : null}

          <div className="apollo-dialog-actions">
            <div className="phone-next"><Phone /><span><strong>Phone reveal is separate</strong><small>It can cost 8 extra credits and needs a public webhook.</small></span></div>
            <Button
              className="apollo-submit"
              onClick={enrichSelectedWithApollo}
              disabled={apolloRunning || !apolloStatus?.configured || !selectedValues.person || !selectedValues.domain}
            >
              {apolloRunning ? <LoaderCircle className="spin" /> : <MailCheck />}
              {apolloRunning ? 'Checking Apollo…' : 'Use up to 1 credit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
