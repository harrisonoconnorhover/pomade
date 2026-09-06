'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import PomadeWorkspace from './pomade-workspace';
import WorkbookTemplateBuilder from './workbook-template-builder';
import {
  DEFAULT_TABLE_ID,
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
    if (!ready || creating) return;
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
  return (
    <div className="pomade-workbook">
      <nav className="workbook-bar" aria-label="Workbook tables">
        <Table2 size={18} />
        <label htmlFor="active-table">Tables</label>
        <select
          id="active-table"
          value={activeId}
          disabled={!ready || creating}
          onChange={(event) => openTable(event.target.value)}
        >
          {!activeId ? <option value="">Loading tables…</option> : null}
          {tables.map((table) => (
            <option key={table.id} value={table.id}>
              {table.name} · {table.rowCount} rows
            </option>
          ))}
        </select>
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
        <span>
          {ready ? `${tables.length} tables` : 'Loading or saving table…'}
        </span>
        {error && !mode ? <output>{error}</output> : null}
      </nav>
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
      ) : null}
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
