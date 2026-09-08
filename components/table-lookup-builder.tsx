'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  createLookupColumns,
  createLookupResolver,
  suggestLookupNormalization,
} from '@/lib/table-lookup';
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
  const [tableRevision, setTableRevision] = useState(0);
  const tableRequestKey = `${workspace.id}:${tableRevision}`;
  const [tableResult, setTableResult] = useState<{
    key: string;
    tables?: TableSummary[];
    error?: string;
  }>();
  const tablesLoading = open && tableResult?.key !== tableRequestKey;
  const tables =
    tableResult?.key === tableRequestKey ? (tableResult.tables ?? []) : [];
  const tableError =
    tableResult?.key === tableRequestKey ? tableResult.error : undefined;
  const [sourceId, setSourceId] = useState('');
  const [sourceResult, setSourceResult] = useState<{
    key: string;
    workspace?: WorkspaceSnapshot;
    error?: string;
  }>();
  const [matchId, setMatchId] = useState(
    workspace.columns.some((c) => c.id === 'domain')
      ? 'domain'
      : (workspace.columns[0]?.id ?? ''),
  );
  const [sourceMatchId, setSourceMatchId] = useState('');
  const [outputIds, setOutputIds] = useState<string[]>([]);
  const [matchRule, setMatchRule] = useState<
    'automatic' | TableLookup['normalization']
  >('automatic');
  const [sourceRevision, setSourceRevision] = useState(0);
  const lastLoadedSourceId = useRef('');
  const sourceRequestKey = `${sourceId}:${sourceRevision}`;
  function changeOpen(value: boolean) {
    if (!value) {
      setSourceRevision((revision) => revision + 1);
      setTableRevision((revision) => revision + 1);
    }
    onOpenChange(value);
  }
  const [comparison, setComparison] =
    useState<NonNullable<TableLookup['comparison']>>('equals');
  const [resultMode, setResultMode] =
    useState<NonNullable<TableLookup['resultMode']>>('unique');
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
        setTableResult({ key: tableRequestKey, tables: available });
        setSourceId((current) =>
          available.some((table) => table.id === current)
            ? current
            : (available[0]?.id ?? ''),
        );
      })
      .catch((e: Error) => {
        if (!cancelled)
          setTableResult({ key: tableRequestKey, error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspace.id, tableRequestKey]);
  useEffect(() => {
    if (!open || !sourceId) return;
    let cancelled = false;
    const sameSource = lastLoadedSourceId.current === sourceId;
    fetch(`/api/workspace?workspaceId=${encodeURIComponent(sourceId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Source table could not be loaded.');
        const result = (await response.json()) as {
          workspace: WorkspaceSnapshot;
        };
        if (cancelled) return;
        setSourceResult({ key: sourceRequestKey, workspace: result.workspace });
        lastLoadedSourceId.current = sourceId;
        setSourceMatchId((current) =>
          sameSource &&
          result.workspace.columns.some((column) => column.id === current)
            ? current
            : (result.workspace.columns.find((column) => column.id === 'domain')
                ?.id ??
              result.workspace.columns.find(
                (column) => column.kind !== 'status',
              )?.id ??
              ''),
        );
        setOutputIds((current) =>
          sameSource
            ? current.filter((id) =>
                result.workspace.columns.some((column) => column.id === id),
              )
            : [],
        );
        setError('');
      })
      .catch((e: Error) => {
        if (!cancelled)
          setSourceResult({ key: sourceRequestKey, error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, sourceId, sourceRequestKey]);
  const sourceLoading =
    open && Boolean(sourceId) && sourceResult?.key !== sourceRequestKey;
  const currentSource =
    !tablesLoading &&
    !tableError &&
    tables.some((table) => table.id === sourceId) &&
    sourceResult?.key === sourceRequestKey
      ? sourceResult.workspace
      : undefined;
  const sourceError =
    sourceResult?.key === sourceRequestKey ? sourceResult.error : undefined;
  const suggestedNormalization = suggestLookupNormalization(
    workspace.columns.find((column) => column.id === matchId),
    currentSource?.columns.find((column) => column.id === sourceMatchId),
  );
  const normalization =
    matchRule === 'automatic' ? suggestedNormalization : matchRule;
  const preview = useMemo(() => {
    if (!currentSource || (resultMode !== 'count' && !outputIds.length))
      return undefined;
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
        comparison,
        resultMode,
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
    comparison,
    resultMode,
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
          comparison,
          resultMode,
        }),
      );
      changeOpen(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'The lookup could not be added.',
      );
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="lookup-builder">
        <DialogHeader>
          <DialogTitle>Look up fields from another table</DialogTitle>
          <DialogDescription>
            Match saved source rows and return up to four fields, JSON lists or
            a match count, sum, average, minimum or maximum. No provider
            requests or credits. Unique mode still flags multiple matches for
            review.
          </DialogDescription>
        </DialogHeader>
        <div className="lookup-fields">
          <label>
            Source table
            <select
              aria-label="Source table"
              disabled={tablesLoading || Boolean(tableError) || !tables.length}
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value);
                setError('');
              }}
            >
              {!tables.length ? (
                <option value="">
                  {tablesLoading
                    ? 'Loading tables…'
                    : tableError
                      ? 'Tables unavailable'
                      : 'Create another table first'}
                </option>
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
              aria-label="Match this table’s column"
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
              aria-label="To the source column"
              value={sourceMatchId}
              disabled={!currentSource}
              onChange={(event) => setSourceMatchId(event.target.value)}
            >
              {!currentSource ? (
                <option value="">
                  {tablesLoading || sourceLoading
                    ? 'Loading source…'
                    : sourceId
                      ? 'Source unavailable'
                      : 'Choose a source table'}
                </option>
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
              aria-label="Match rule"
              value={matchRule}
              onChange={(event) =>
                setMatchRule(event.target.value as typeof matchRule)
              }
            >
              <option value="automatic">
                Automatic ·{' '}
                {suggestedNormalization === 'domain'
                  ? 'Website / domain'
                  : 'Text'}
              </option>
              <option value="domain">
                Website / domain (ignore www and paths)
              </option>
              <option value="text">Text (ignore case and outer spaces)</option>
              <option value="exact">Exact text</option>
            </select>
          </label>
        </div>
        <div className="lookup-source-status">
          <span>
            {tablesLoading
              ? 'Loading source tables…'
              : tableError
                ? 'Source tables are unavailable'
                : sourceLoading
                  ? 'Loading saved source values…'
                  : currentSource
                    ? `${currentSource.rows.length} saved source rows`
                    : sourceId
                      ? 'Source is unavailable'
                      : 'Create another table to use a lookup'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={tablesLoading || (!tableError && sourceLoading)}
            onClick={() => {
              setError('');
              if (tableError || !sourceId)
                setTableRevision((value) => value + 1);
              else setSourceRevision((value) => value + 1);
            }}
          >
            {tableError
              ? 'Retry tables'
              : !sourceId
                ? 'Reload tables'
                : currentSource
                  ? 'Reload source'
                  : 'Retry source'}
          </Button>
        </div>
        <div className="lookup-fields">
          <label>
            Comparison
            <select
              aria-label="Comparison"
              value={comparison}
              onChange={(e) =>
                setComparison(e.target.value as typeof comparison)
              }
            >
              <option value="equals">Equal normalized keys</option>
              <option value="contains">Source key contains local key</option>
            </select>
          </label>
          <label>
            Result mode
            <select
              aria-label="Result mode"
              value={resultMode}
              onChange={(e) =>
                setResultMode(e.target.value as typeof resultMode)
              }
            >
              <option value="unique">Require one match</option>
              <option value="list">List values from all matches</option>
              <option value="count">Count matching rows</option>
              <option value="sum">Sum matching numeric values</option>
              <option value="average">Average matching numeric values</option>
              <option value="min">Minimum matching value</option>
              <option value="max">Maximum matching value</option>
            </select>
          </label>
        </div>
        {resultMode === 'list' ? (
          <p>
            Lists preserve source row order, duplicate values and blanks. Up to
            100 matches and 4,000 characters per output; larger results go to
            review.
          </p>
        ) : null}
        {['sum', 'average', 'min', 'max'].includes(resultMode) ? (
          <p>
            Blank values are ignored. Plain decimal numbers and scientific
            notation are accepted; formatted currency, percentages and other
            text require cleanup first. Invalid values send the result to
            review. Sum returns zero for no numeric values; average/min/max
            require at least one. Results use 15 significant digits.
          </p>
        ) : null}
        {resultMode !== 'count' ? (
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
        ) : null}
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
        {tableError ||
        error ||
        sourceError ||
        (preview && 'error' in preview) ? (
          <p className="template-error" role="alert">
            {tableError || error || sourceError || preview?.error}
          </p>
        ) : null}
        <p className="lookup-note">
          Runs read saved source values. Unique mode flags missing or multiple
          matches. List/count modes return an empty list or zero when a valid
          key has no matches. Missing inputs or oversized lists stay in review.
          The source table is unchanged.
        </p>
        <Button
          className="lookup-add-button"
          onClick={add}
          disabled={!preview || 'error' in preview || !currentSource}
        >
          Add lookup column
        </Button>
      </DialogContent>
    </Dialog>
  );
}
