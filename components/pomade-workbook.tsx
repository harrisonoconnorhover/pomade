'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, LoaderCircle } from 'lucide-react';
import SheetSwitcher from './sheet-switcher';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import PomadeWorkspace from './pomade-workspace';
import AccountSettings from './account-settings';
import WorkbookTemplateBuilder from './workbook-template-builder';
import WorkbookPromptBuilder from './workbook-prompt-builder';
import {
  DEFAULT_TABLE_ID,
  relatedWorkbookTables,
  type TableCreationMode,
  type TableSummary,
} from '@/lib/workbook';

export default function PomadeWorkbook({
  deployment,
}: {
  deployment: { hosted: boolean; label: string; schedulesEnabled: boolean };
}) {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [activeId, setActiveId] = useState('');
  const [focusRowId, setFocusRowId] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<TableCreationMode>();
  const [name, setName] = useState('');
  const [rowIds, setRowIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/tables')
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Tables could not be loaded. Reload to try again.');
        const result = (await response.json()) as { tables: TableSummary[] };
        if (cancelled) return;
        setTables(result.tables);
        const query = new URLSearchParams(window.location.search);
        const requested = query.get('table') ?? DEFAULT_TABLE_ID;
        const found = result.tables.some((table) => table.id === requested);
        setActiveId(found ? requested : DEFAULT_TABLE_ID);
        setFocusRowId(found ? (query.get('row') ?? '') : '');
        if (!found)
          setError('That table is unavailable. Opened the original table.');
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const onStateChange = useCallback(
    (summary: TableSummary, canLeave: boolean) => {
      setReady(canLeave);
      setTables((current) =>
        current.map((table) => (table.id === summary.id ? summary : table)),
      );
    },
    [],
  );
  function openTable(id: string, rowId = '') {
    if (!ready || creating || (id === activeId && rowId === focusRowId)) return;
    if (!tables.some((table) => table.id === id)) {
      setError('The source table is unavailable.');
      return;
    }
    setReady(false);
    setActiveId(id);
    setFocusRowId(rowId);
    setError('');
    const url = new URL(window.location.href);
    url.searchParams.set('table', id);
    if (rowId) url.searchParams.set('row', rowId);
    else url.searchParams.delete('row');
    window.history.replaceState(null, '', url);
  }
  function startCreate(next: TableCreationMode, selection: string[] = []) {
    if (!ready) return;
    setMode(next);
    setRowIds(selection);
    const currentName =
      tables.find((table) => table.id === activeId)?.name ?? 'Table';
    setName(
      next === 'empty'
        ? 'New table'
        : next === 'duplicate'
          ? `${currentName} copy`
          : `${currentName} — selected rows`,
    );
    setError('');
  }
  async function create() {
    if (!mode || !ready || creating) return;
    setCreating(true);
    setError('');
    try {
      const response = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          mode,
          sourceId: activeId,
          rowIds: mode === 'linked' ? rowIds : undefined,
        }),
      });
      const result = (await response.json()) as {
        table?: TableSummary;
        error?: string;
      };
      if (!response.ok || !result.table)
        throw new Error(result.error ?? 'Table could not be created.');
      setTables((current) => [...current, result.table!]);
      setActiveId(result.table.id);
      setFocusRowId('');
      setReady(false);
      setMode(undefined);
      const url = new URL(window.location.href);
      url.searchParams.set('table', result.table.id);
      url.searchParams.delete('row');
      window.history.replaceState(null, '', url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Table could not be created.');
    } finally {
      setCreating(false);
    }
  }
  const relatedTables = relatedWorkbookTables(tables, activeId);
  return (
    <div className="pomade-workbook">
      <nav className="workbook-bar" aria-label="Workbook tables">
        <div className="workbook-brand">
          <span className="logo-mark" aria-hidden="true">
            <span>P</span>
          </span>
          <span className="brand-name">Pomade</span>
        </div>
        <span className="workbook-separator" aria-hidden="true" />
        <SheetSwitcher
          tables={tables}
          activeId={activeId}
          disabled={!ready || creating}
          onSelect={openTable}
        />
        <div className="workbook-create-actions">
          <Button
            variant="outline"
            disabled={!ready || creating}
            onClick={() => startCreate('empty')}
          >
            <Plus /> New table
          </Button>
          <Button
            variant="outline"
            disabled={!ready || creating}
            onClick={() => startCreate('duplicate')}
          >
            <Copy /> Duplicate
          </Button>
          <WorkbookPromptBuilder
            disabled={!ready || creating}
            onBusy={setCreating}
            onCreated={(added) => {
              setTables((current) => [
                ...current.filter(
                  (table) => !added.some((item) => item.id === table.id),
                ),
                ...added,
              ]);
              setActiveId(added[0].id);
              setFocusRowId('');
              setReady(false);
              const url = new URL(window.location.href);
              url.searchParams.set('table', added[0].id);
              url.searchParams.delete('row');
              window.history.replaceState(null, '', url);
            }}
          />
          <WorkbookTemplateBuilder
            tables={tables}
            disabled={!ready || creating}
            onBusy={setCreating}
            onCreated={(added) => {
              setTables((current) => [...current, ...added]);
              setActiveId(added[0].id);
              setFocusRowId('');
              setReady(false);
              const url = new URL(window.location.href);
              url.searchParams.set('table', added[0].id);
              url.searchParams.delete('row');
              window.history.replaceState(null, '', url);
            }}
          />
        </div>
        <span className="workbook-table-count">
          {ready ? (
            `${tables.length} sheets`
          ) : (
            <>
              <LoaderCircle className="spin" size={14} /> Updating…
            </>
          )}
        </span>
        {deployment.hosted ? <AccountSettings /> : null}
        {error && !mode ? (
          <output className="workbook-error" role="alert">
            {error}
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </output>
        ) : null}
      </nav>
      {relatedTables.length > 1 ? (
        <nav
          className="related-sheet-tabs"
          aria-label="Related workbook sheets"
        >
          <span
            className="related-workbook-name"
            title={relatedTables[0].workbook?.name}
          >
            {relatedTables[0].workbook?.name}
          </span>
          <div>
            {relatedTables.map((table) => (
              <button
                key={table.id}
                type="button"
                aria-current={table.id === activeId ? 'page' : undefined}
                disabled={!ready || creating}
                onClick={() => openTable(table.id)}
              >
                <span>{table.name}</span>
                <small>{table.rowCount.toLocaleString()}</small>
              </button>
            ))}
          </div>
        </nav>
      ) : null}
      {activeId ? (
        <PomadeWorkspace
          key={`${activeId}:${focusRowId}`}
          deployment={deployment}
          workspaceId={activeId}
          initialRowId={focusRowId}
          onTableState={onStateChange}
          onOpenTable={openTable}
          onCopyRows={(ids) => startCreate('linked', ids)}
        />
      ) : (
        <main className="workbook-starting" aria-busy={!error}>
          <span className="logo-mark" aria-hidden="true">
            <span>P</span>
          </span>
          <h1>
            {error ? 'Unable to open your workbook' : 'Opening your workbook'}
          </h1>
          <p>
            {error ||
              'Your sheets and saved workflows will be ready in a moment.'}
          </p>
          {error ? (
            <Button onClick={() => window.location.reload()}>Try again</Button>
          ) : (
            <LoaderCircle className="spin" aria-hidden="true" />
          )}
        </main>
      )}
      <Dialog
        open={Boolean(mode)}
        onOpenChange={(open) => {
          if (!open && !creating) setMode(undefined);
        }}
      >
        <DialogContent className="template-dialog">
          <DialogHeader>
            <DialogTitle>
              {mode === 'linked'
                ? 'Send rows to a new table'
                : mode === 'duplicate'
                  ? 'Duplicate table'
                  : 'New table'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'linked'
                ? `${rowIds.length} selected rows will be copied as values with links back to the source. The source stays unchanged.`
                : mode === 'duplicate'
                  ? 'Copy data, recipes and saved views. The new table has its own history and no active schedule.'
                  : 'Start an empty table, then import a CSV, add rows or find companies.'}
            </DialogDescription>
          </DialogHeader>
          <label className="workbook-name">
            Table name
            <input
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error ? <p className="template-error">{error}</p> : null}
          <Button
            onClick={() => void create()}
            disabled={!name.trim() || creating || !ready}
          >
            {creating ? 'Creating…' : 'Create table'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
