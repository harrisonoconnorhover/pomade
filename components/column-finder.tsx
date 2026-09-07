'use client';
import { useState } from 'react';
import { ArrowRight, Columns3, Search } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import type { PomadeColumn } from '@/lib/pomade-types';
export default function ColumnFinder({
  columns,
  disabled,
  onVisibility,
  onShowAll,
  onJump,
}: {
  columns: PomadeColumn[];
  disabled: boolean;
  onVisibility: (id: string, hidden: boolean) => void;
  onShowAll: () => void;
  onJump: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const visible = columns.filter((c) => !c.hidden).length;
  const matches = columns.filter((c) =>
    query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .every((word) =>
        `${c.title} ${c.id} ${c.kind}`.toLowerCase().includes(word),
      ),
  );
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
        title="Find, show, or hide columns"
      >
        <Columns3 /> Columns{' '}
        <span className="column-count">
          {visible}/{columns.length}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="column-finder-dialog">
          <DialogHeader>
            <DialogTitle>Find a column</DialogTitle>
            <DialogDescription>
              Click a name to jump there. Hidden columns keep their data and
              still run their recipes.
            </DialogDescription>
          </DialogHeader>
          <label className="catalog-search">
            <Search aria-hidden="true" />
            <input
              aria-label="Search columns"
              placeholder="Search by column name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="catalog-list-heading">
            <span>
              {visible} of {columns.length} visible
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || visible === columns.length}
              onClick={onShowAll}
            >
              Show all
            </Button>
          </div>
          <div className="column-finder-list">
            {matches.map((column) => (
              <div
                className="column-finder-row"
                key={column.id}
                data-hidden={Boolean(column.hidden)}
              >
                <input
                  type="checkbox"
                  aria-label={`Show ${column.title}`}
                  checked={!column.hidden}
                  disabled={disabled || (!column.hidden && visible === 1)}
                  onChange={(e) => onVisibility(column.id, !e.target.checked)}
                />
                <button
                  type="button"
                  disabled={disabled && column.hidden}
                  onClick={() => {
                    onJump(column.id);
                    setOpen(false);
                  }}
                >
                  <span>
                    <strong>{column.title}</strong>
                    <small>
                      {column.hidden ? 'Hidden · ' : ''}
                      {column.kind === 'enrichment'
                        ? 'Enrichment'
                        : column.kind === 'formula'
                          ? 'Formula'
                          : column.kind === 'status'
                            ? 'Run status'
                            : 'Data field'}
                    </small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              </div>
            ))}
            {!matches.length ? (
              <p className="catalog-empty">
                No matching columns. Try a shorter name.
              </p>
            ) : null}
          </div>
          <small className="catalog-footnote">
            Visibility is saved with this sheet. Keep at least one column
            visible.
          </small>
        </DialogContent>
      </Dialog>
    </>
  );
}
