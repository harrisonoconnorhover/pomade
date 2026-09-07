'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Table2 } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import type { TableSummary } from '@/lib/workbook';

export default function SheetSwitcher({
  tables,
  activeId,
  disabled,
  onSelect,
}: {
  tables: TableSummary[];
  activeId: string;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const active = tables.find((table) => table.id === activeId);
  const matches = useMemo(() => {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return tables.filter((table) =>
      words.every((word) => table.name.toLocaleLowerCase().includes(word)),
    );
  }, [tables, query]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        (!event.metaKey && !event.ctrlKey) ||
        event.key.toLowerCase() !== 'k' ||
        event.altKey ||
        event.shiftKey ||
        disabled ||
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"]',
        )
      )
        return;
      event.preventDefault();
      setQuery('');
      setOpen(true);
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [disabled]);
  function choose(id: string) {
    if (disabled) return;
    setOpen(false);
    onSelect(id);
  }
  return (
    <>
      <Button
        ref={trigger}
        className="sheet-switcher-trigger"
        variant="ghost"
        disabled={disabled}
        aria-label={`Switch sheet. Current sheet: ${active?.name ?? 'Loading'}`}
        aria-keyshortcuts="Meta+K Control+K"
        aria-haspopup="dialog"
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
      >
        <Table2 aria-hidden="true" />
        <span>{active?.name ?? 'Loading sheets…'}</span>
        <ChevronDown aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sheet-switcher-dialog"
          finalFocus={trigger}
          initialFocus={searchInput}
        >
          <DialogHeader>
            <DialogTitle>Jump to a sheet</DialogTitle>
            <DialogDescription>
              {tables.length} sheets in your workbook. Search by name, then
              choose a sheet.
            </DialogDescription>
          </DialogHeader>
          <label className="sheet-switcher-search">
            <Search aria-hidden="true" />
            <input
              ref={searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search sheets"
              placeholder="Search your sheets…"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && matches.length) {
                  event.preventDefault();
                  choose(matches[0].id);
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  document
                    .getElementById('sheet-switcher-results')
                    ?.querySelector<HTMLButtonElement>('button')
                    ?.focus();
                }
              }}
            />
          </label>
          <div
            className="sheet-switcher-results"
            id="sheet-switcher-results"
            aria-label="Matching sheets"
          >
            {matches.map((table) => (
              <button
                type="button"
                key={table.id}
                className="sheet-switcher-item"
                aria-current={table.id === activeId ? 'page' : undefined}
                disabled={disabled}
                onClick={() => choose(table.id)}
              >
                <span className="sheet-switcher-icon">
                  <Table2 aria-hidden="true" />
                </span>
                <span className="sheet-switcher-name">
                  <strong>{table.name}</strong>
                  <small>
                    {table.rowCount.toLocaleString()} rows · {table.columnCount}{' '}
                    columns
                  </small>
                </span>
                {table.id === activeId ? (
                  <Check aria-label="Current sheet" />
                ) : null}
              </button>
            ))}
            {!matches.length ? (
              <div className="sheet-switcher-empty">
                <Search aria-hidden="true" />
                <strong>No matching sheets</strong>
                <p>Try a shorter name or clear your search.</p>
                <Button variant="outline" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              </div>
            ) : null}
          </div>
          <div className="sheet-switcher-hint">
            <span>⌘ K / Ctrl K to open</span>
            <span>Enter to open the first match · Esc to close</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
