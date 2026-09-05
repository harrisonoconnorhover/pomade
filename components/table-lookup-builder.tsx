'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createLookupColumns, createLookupResolver } from '@/lib/table-lookup';
import type {
  PomadeColumn,
  TableLookup,
  WorkspaceSnapshot,
} from '@/lib/pomade-types';
import type { TableSummary } from '@/lib/workbook';

export default function TableLookupBuilder({
  open,
  onOpenChange,
  workspace,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: WorkspaceSnapshot;
  onAdd: (columns: PomadeColumn[]) => void;
}) {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [source, setSource] = useState<WorkspaceSnapshot>();
  const [matchId, setMatchId] = useState(
    workspace.columns.some((c) => c.id === 'domain')
      ? 'domain'
      : (workspace.columns[0]?.id ?? ''),
  );
  const [sourceMatchId, setSourceMatchId] = useState('');
  const [outputIds, setOutputIds] = useState<string[]>([]);
  const [normalization, setNormalization] =
    useState<TableLookup['normalization']>('domain');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/tables')
      .then(async (response) => {
        if (!response.ok) throw new Error('Source tables could not be loaded.');
        const result = (await response.json()) as { tables: TableSummary[] };
        if (cancelled) return;
        const available = result.tables.filter(
          (table) => table.id !== workspace.id,
        );
        setTables(available);
        setSourceId((current) =>
          available.some((table) => table.id === current)
            ? current
            : (available[0]?.id ?? ''),
        );
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspace.id]);
  useEffect(() => {
    if (!open || !sourceId) return;
    let cancelled = false;
    fetch(`/api/workspace?workspaceId=${encodeURIComponent(sourceId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Source table could not be loaded.');
        const result = (await response.json()) as {
          workspace: WorkspaceSnapshot;
        };
        if (cancelled) return;
        setSource(result.workspace);
        setSourceMatchId(
          result.workspace.columns.some((column) => column.id === 'domain')
            ? 'domain'
            : (result.workspace.columns[0]?.id ?? ''),
        );
        setOutputIds([]);
        setError('');
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sourceId]);
  const currentSource = source?.id === sourceId ? source : undefined;
  const preview = useMemo(() => {
    if (!currentSource || !outputIds.length) return undefined;
    try {
      let id = 'lookup_preview';
      while (workspace.columns.some((column) => column.id.startsWith(id)))
        id += '_';
      const columns = createLookupColumns(workspace, currentSource, {
        id,
        matchColumnId: matchId,
        sourceMatchColumnId: sourceMatchId,
        sourceOutputIds: outputIds,
        normalization,
      });
      const resolve = createLookupResolver(columns[0], currentSource);
      return {
        columns,
        rows: workspace.rows.slice(0, 5).map((row) => ({
          id: row.id,
          input: row.values[matchId] ?? '',
          result: resolve(row),
        })),
      };
    } catch (e) {
      return {
        error:
          e instanceof Error ? e.message : 'Check the lookup configuration.',
      };
    }
  }, [
    currentSource,
    outputIds,
    workspace,
    matchId,
    sourceMatchId,
    normalization,
  ]);
  function add() {
    if (!currentSource) return;
    try {
      onAdd(
        createLookupColumns(workspace, currentSource, {
          id: `lookup_${crypto.randomUUID().replaceAll('-', '')}`,
          matchColumnId: matchId,
          sourceMatchColumnId: sourceMatchId,
          sourceOutputIds: outputIds,
          normalization,
        }),
      );
      onOpenChange(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'The lookup could not be added.',
      );
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lookup-builder">
        <DialogHeader>
          <DialogTitle>Look up fields from another table</DialogTitle>
          <DialogDescription>
            Match a record once and return up to four saved fields. No provider
            requests or credits. Multiple matches stay in review.
          </DialogDescription>
        </DialogHeader>
        <div className="lookup-fields">
          <label>
            Source table
            <select
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value);
                setError('');
              }}
            >
              {!tables.length ? (
                <option value="">Create another table first</option>
              ) : null}
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Match this table’s column
            <select
              value={matchId}
              onChange={(event) => setMatchId(event.target.value)}
            >
              {workspace.columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            To the source column
            <select
              value={sourceMatchId}
              disabled={!currentSource}
              onChange={(event) => setSourceMatchId(event.target.value)}
            >
              {!currentSource ? (
                <option value="">Loading source…</option>
              ) : null}
              {currentSource?.columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Match rule
            <select
              value={normalization}
              onChange={(event) =>
                setNormalization(
                  event.target.value as TableLookup['normalization'],
                )
              }
            >
              <option value="domain">
                Website / domain (ignore www and paths)
              </option>
              <option value="text">Text (ignore case and outer spaces)</option>
              <option value="exact">Exact text</option>
            </select>
          </label>
        </div>
        <fieldset className="lookup-outputs">
          <legend>Fields to return ({outputIds.length}/4)</legend>
          {currentSource?.columns
            .filter((column) => column.kind !== 'status')
            .map((column) => (
              <label key={column.id}>
                <input
                  type="checkbox"
                  checked={outputIds.includes(column.id)}
                  disabled={
                    outputIds.length === 4 && !outputIds.includes(column.id)
                  }
                  onChange={(event) =>
                    setOutputIds((current) =>
                      event.target.checked
                        ? [...current, column.id]
                        : current.filter((id) => id !== column.id),
                    )
                  }
                />
                {column.title}
              </label>
            ))}
        </fieldset>
        {preview && 'columns' in preview ? (
          <div className="lookup-preview">
            <p>Preview · first five rows · saved source data</p>
            <table>
              <thead>
                <tr>
                  <th>Match value</th>
                  {preview.columns?.map((column) => (
                    <th key={column.id}>{column.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows?.map((row) => (
                  <tr key={row.id}>
                    <td>{row.input || '—'}</td>
                    {preview.columns?.map((column) => (
                      <td key={column.id}>
                        {row.result.values[column.id] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!preview.rows?.length ? (
              <p>The table is empty. Add rows to run this lookup.</p>
            ) : null}
          </div>
        ) : null}
        {error || (preview && 'error' in preview) ? (
          <p className="template-error">{error || preview?.error}</p>
        ) : null}
        <p className="lookup-note">
          Runs read the source table’s saved values. A missing or duplicate
          match clears previous lookup outputs and records why. This does not
          edit the source table.
        </p>
        <Button
          onClick={add}
          disabled={!preview || 'error' in preview || !currentSource}
        >
          Add lookup column
        </Button>
      </DialogContent>
    </Dialog>
  );
}
