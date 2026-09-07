'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileSpreadsheet, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import {
  appendCsvRows,
  parseCsvImport,
  planCsvAppend,
  suggestCsvMapping,
  MAX_CSV_BYTES,
  CSV_NEW_COLUMN,
  CSV_SKIP_COLUMN,
  type CsvPreview,
  type CsvMapping,
} from '@/lib/csv-import';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
import type { TableSummary } from '@/lib/workbook';
export default function CsvImportDialog({
  file,
  workspace,
  ready,
  onClose,
  onAppend,
  onCreated,
}: {
  file: File;
  workspace: WorkspaceSnapshot;
  ready: boolean;
  onClose: () => void;
  onAppend: (workspace: WorkspaceSnapshot) => void;
  onCreated: (table: TableSummary) => void;
}) {
  const [result, setResult] = useState<{ text: string; preview: CsvPreview }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'new' | 'append'>('new');
  const [name, setName] = useState(
    file.name.replace(/\.csv$/i, '').slice(0, 100) || 'Imported sheet',
  );
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [inputWorkspace] = useState(workspace);
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      if (file.size > MAX_CSV_BYTES)
        throw new Error(
          'Choose a CSV smaller than 2 MB. Split larger exports into smaller files.',
        );
      const text = await file.text();
      const preview = parseCsvImport(text);
      if (!cancelled) {
        setResult({ text, preview });
        setMapping(suggestCsvMapping(inputWorkspace, preview));
      }
    };
    void read().catch((e) => {
      if (!cancelled) setError(e.message);
    });
    return () => {
      cancelled = true;
    };
  }, [file, inputWorkspace]);
  const plan = useMemo(() => {
    if (!result) return undefined;
    try {
      return { value: planCsvAppend(workspace, result.preview, mapping) };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : 'Check the column mapping.',
      };
    }
  }, [workspace, result, mapping]);
  const issue =
    mode === 'new' ? (!name.trim() ? 'Name your new sheet.' : '') : plan?.error;
  async function apply() {
    if (!result || !ready || busy || issue) return;
    setError('');
    setBusy(true);
    try {
      if (mode === 'append') {
        onAppend(appendCsvRows(workspace, result.preview, mapping, file.name));
        onClose();
        return;
      }
      const response = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'csv',
          name: name.trim(),
          csv: result.text,
          filename: file.name,
        }),
      });
      const data = (await response.json()) as {
        table?: TableSummary;
        error?: string;
      };
      if (!response.ok || !data.table)
        throw new Error(data.error ?? 'The new sheet could not be created.');
      onCreated(data.table);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'The CSV could not be imported.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="csv-import-dialog">
        <DialogHeader>
          <DialogTitle>Preview your CSV</DialogTitle>
          <DialogDescription>
            Choose where the rows go before importing. Your current sheet stays
            intact.
          </DialogDescription>
        </DialogHeader>
        <div className="csv-file-summary">
          <FileSpreadsheet />
          <div>
            <strong>{file.name}</strong>
            <small>
              {result
                ? `${result.preview.rows.length.toLocaleString()} rows · ${result.preview.columns.length} columns`
                : 'Reading file…'}
            </small>
          </div>
        </div>
        {result ? (
          <>
            <fieldset className="csv-destination">
              <legend>Where should these rows go?</legend>
              <label aria-label="Create a new sheet">
                <input
                  type="radio"
                  name="csv-destination"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                  disabled={busy}
                />
                <span>
                  <strong>Create a new sheet</strong>
                  <small>Keep this sheet exactly as it is</small>
                </span>
              </label>
              <label aria-label="Add rows to this sheet">
                <input
                  type="radio"
                  name="csv-destination"
                  checked={mode === 'append'}
                  onChange={() => setMode('append')}
                  disabled={busy}
                />
                <span>
                  <strong>Add rows to this sheet</strong>
                  <small>Keep existing rows and recipe columns</small>
                </span>
              </label>
            </fieldset>
            {mode === 'new' ? (
              <label className="csv-sheet-name">
                New sheet name
                <input
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </label>
            ) : (
              <details className="csv-column-mapping" open>
                <summary>
                  Map {result.preview.columns.length} CSV columns ·{' '}
                  {plan?.value?.added.length ?? 0} new fields
                </summary>
                <div>
                  {result.preview.columns.map((column, index) => (
                    <label key={column.id}>
                      <span>
                        <strong>{column.title}</strong>
                        <small>
                          {result.preview.rows[0]?.[index] || 'No sample value'}
                        </small>
                      </span>
                      <ArrowRight aria-hidden="true" />
                      <select
                        aria-label={`Map ${column.title}`}
                        value={mapping[column.id] ?? CSV_NEW_COLUMN}
                        disabled={busy}
                        onChange={(e) =>
                          setMapping((current) => ({
                            ...current,
                            [column.id]: e.target.value,
                          }))
                        }
                      >
                        <option value={CSV_NEW_COLUMN}>Create new field</option>
                        <option value={CSV_SKIP_COLUMN}>
                          Skip this column
                        </option>
                        {workspace.columns
                          .filter((c) => c.kind === 'text')
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                              {workspace.columns.filter(
                                (other) => other.title === c.title,
                              ).length > 1
                                ? ` (${c.id})`
                                : ''}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                </div>
              </details>
            )}
            <div className="csv-preview-table">
              <table>
                <caption>
                  First {Math.min(5, result.preview.rows.length)} rows ·{' '}
                  {mode === 'new'
                    ? 'new sheet preview'
                    : 'CSV values to append'}
                </caption>
                <thead>
                  <tr>
                    {result.preview.columns.map((c) => (
                      <th key={c.id}>{c.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.preview.rows.slice(0, 5).map((row, index) => (
                    <tr key={index}>
                      {row.map((value, i) => (
                        <td key={i}>{value || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.preview.renamedHeaders ? (
              <p className="csv-import-note">
                {result.preview.renamedHeaders} blank or repeated headers were
                given distinct names. CSV Status values stay separate from
                Pomade’s run status.
              </p>
            ) : null}
            {mode === 'append' ? (
              <p className="csv-import-note">
                Adds {result.preview.rows.length} rows; existing rows are
                unchanged. Importing again adds another copy. Any active
                schedule pauses for review.
              </p>
            ) : null}
          </>
        ) : !error ? (
          <LoaderCircle className="spin" />
        ) : null}
        {error || issue ? (
          <p className="template-error" role="alert">
            {error || issue}
          </p>
        ) : null}
        <div className="csv-import-actions">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!result || !ready || busy || Boolean(issue)}
            onClick={() => void apply()}
          >
            {busy
              ? 'Importing…'
              : mode === 'new'
                ? 'Create sheet from CSV'
                : `Add ${result?.preview.rows.length ?? 0} rows`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
