'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
import { workspaceCsv } from '@/lib/csv-import';

export default function CsvExportDialog({
  workspace,
  visibleRowIds,
  selectedRowIds,
  onClose,
  onExported,
}: {
  workspace: WorkspaceSnapshot;
  visibleRowIds: string[];
  selectedRowIds: string[];
  onClose: () => void;
  onExported: (count: number) => void;
}) {
  const [scope, setScope] = useState(
    selectedRowIds.length ? 'selected' : 'view',
  );
  const [includeHidden, setIncludeHidden] = useState(false);
  const ids = new Set(scope === 'selected' ? selectedRowIds : visibleRowIds);
  const rows =
    scope === 'all'
      ? workspace.rows
      : workspace.rows.filter((row) => ids.has(row.id));
  const columns = workspace.columns.filter(
    (column) => includeHidden || !column.hidden,
  );
  function download() {
    const blob = new Blob([workspaceCsv({ ...workspace, rows, columns })], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${
      workspace.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'pomade'
    }-${scope}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    onExported(rows.length);
    onClose();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="csv-export-dialog">
        <DialogHeader>
          <DialogTitle>Export CSV</DialogTitle>
          <DialogDescription>
            Choose exactly which rows and columns to download.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="export-scopes">
          <legend>Rows to export</legend>
          {[
            {
              id: 'selected',
              label: 'Selected rows',
              count: selectedRowIds.length,
              help: 'Only rows checked in the current view.',
            },
            {
              id: 'view',
              label: 'Current view',
              count: visibleRowIds.length,
              help: 'Respects your search, filters, and saved view.',
            },
            {
              id: 'all',
              label: 'Entire sheet',
              count: workspace.rows.length,
              help: 'Includes rows outside the current view.',
            },
          ].map((option) => (
            <label
              key={option.id}
              className="export-scope"
              aria-label={option.label}
              data-selected={scope === option.id}
            >
              <input
                type="radio"
                name="export-scope"
                value={option.id}
                checked={scope === option.id}
                disabled={option.id === 'selected' && !option.count}
                onChange={() => setScope(option.id)}
              />
              <span>
                <strong>
                  {option.label} <small>{option.count.toLocaleString()}</small>
                </strong>
                <span>{option.help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="export-hidden">
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(event) => setIncludeHidden(event.target.checked)}
          />
          Include hidden columns
        </label>
        <p className="export-summary" aria-live="polite">
          {rows.length.toLocaleString()} {rows.length === 1 ? 'row' : 'rows'} ·{' '}
          {columns.length} {columns.length === 1 ? 'column' : 'columns'}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={download}>
            <Download />
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
