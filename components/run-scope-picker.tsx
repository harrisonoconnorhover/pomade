'use client';
import type { PomadeColumn, PomadeRow } from '@/lib/pomade-types';
import { countMaximumExternalActions } from '@/lib/external-recipes';
export default function RunScopePicker({
  columns,
  rows,
  selectedIds,
  onChange,
  mode,
  onModeChange,
  requiresBackground,
}: {
  columns: PomadeColumn[];
  rows: PomadeRow[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  mode: 'immediate' | 'background';
  onModeChange: (mode: 'immediate' | 'background') => void;
  requiresBackground: boolean;
}) {
  return (
    <section className="run-scope-picker" aria-label="Choose run scope">
      <div className="run-scope-heading">
        <strong>
          Columns to run <small>{selectedIds.length} selected</small>
        </strong>
        <span>
          <button
            type="button"
            onClick={() => onChange(columns.map((c) => c.id))}
          >
            Select all
          </button>
          <button type="button" onClick={() => onChange([])}>
            Clear
          </button>
        </span>
      </div>
      <div className="run-scope-columns">
        {columns.map((column) => {
          const maximum = countMaximumExternalActions(rows, [column]);
          return (
            <label key={column.id} aria-label={`Run ${column.title}`}>
              <input
                type="checkbox"
                checked={selectedIds.includes(column.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selectedIds, column.id]
                      : selectedIds.filter((id) => id !== column.id),
                  )
                }
              />
              <span>
                <strong>{column.title}</strong>
                <small>
                  {maximum
                    ? `Up to ${maximum} provider ${maximum === 1 ? 'submission' : 'submissions'}`
                    : 'No provider requests'}
                </small>
              </span>
            </label>
          );
        })}
      </div>
      <fieldset className="run-mode-picker">
        <legend>How to run</legend>
        <label>
          <input
            type="radio"
            name="run-mode"
            checked={mode === 'immediate'}
            disabled={requiresBackground}
            onChange={() => onModeChange('immediate')}
          />
          Run now
        </label>
        <label>
          <input
            type="radio"
            name="run-mode"
            checked={mode === 'background'}
            onChange={() => onModeChange('background')}
          />
          Background
        </label>
      </fieldset>
      {requiresBackground && (
        <p className="run-mode-note">
          A selected provider returns results asynchronously and requires a
          background run.
        </p>
      )}
      <p className="run-mode-note">
        Recipes run in sheet order. Include earlier formula columns when their
        results are needed.
      </p>
    </section>
  );
}
