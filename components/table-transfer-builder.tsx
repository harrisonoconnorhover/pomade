'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { saveTransferRule, type TransferChange } from '@/lib/table-transfer';
import type { WorkspaceSnapshot, TableTransferRule } from '@/lib/pomade-types';
import type { TableSummary } from '@/lib/workbook';
type Preview = {
  sourceRevision: number;
  targetRevision: number;
  added: number;
  updated: number;
  skipped: number;
  review: number;
  changes: TransferChange[];
  detailsLimited?: boolean;
};
export default function TableTransferBuilder({
  source,
  saved,
  selectedRowIds,
  onSave,
}: {
  source: WorkspaceSnapshot;
  saved: boolean;
  selectedRowIds: string[];
  onSave: (workspace: WorkspaceSnapshot) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [target, setTarget] = useState<WorkspaceSnapshot>();
  const [rule, setRule] = useState<TableTransferRule>();
  const [preview, setPreview] = useState<Preview>();
  const [previewScope, setPreviewScope] = useState('');
  const [useSelection, setUseSelection] = useState(false);
  const [history, setHistory] = useState<
    (Preview & { id: string; ruleName: string; createdAt: number })[]
  >([]);
  const rowIds = useSelection ? selectedRowIds : undefined;
  const scopeKey = JSON.stringify(rowIds ?? null);
  async function load() {
    setOpen(true);
    setBusy(true);
    setError('');
    try {
      const [r, h] = await Promise.all([
        fetch('/api/tables'),
        fetch(`/api/transfers?sourceId=${encodeURIComponent(source.id)}`),
      ]);
      if (!r.ok || !h.ok) throw new Error('Transfer data could not be loaded.');
      const data = (await r.json()) as { tables: TableSummary[] };
      const runs = (await h.json()) as { runs: typeof history };
      setTables(data.tables.filter((t) => t.id !== source.id));
      setHistory(runs.runs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed.');
    } finally {
      setBusy(false);
    }
  }
  async function chooseTarget(id: string, existing?: TableTransferRule) {
    setBusy(true);
    setPreview(undefined);
    setError('');
    try {
      const r = await fetch(
        `/api/workspace?workspaceId=${encodeURIComponent(id)}`,
      );
      if (!r.ok) throw new Error('Destination could not be loaded.');
      const data = (await r.json()) as { workspace: WorkspaceSnapshot };
      setTarget(data.workspace);
      const targetKey =
        data.workspace.columns.find(
          (c) => c.kind === 'text' && c.id === 'domain',
        )?.id ??
        data.workspace.columns.find((c) => c.kind === 'text')?.id ??
        '';
      setRule(
        existing ?? {
          id: crypto.randomUUID(),
          name: `Send to ${data.workspace.name}`,
          targetTableId: id,
          sourceKey: source.columns.some((c) => c.id === 'domain')
            ? 'domain'
            : source.columns[0].id,
          targetKey,
          normalization:
            targetKey === 'domain' &&
            source.columns.some((c) => c.id === 'domain')
              ? 'domain'
              : 'text',
          mode: 'upsert',
          skipBlank: true,
          mapping: Object.fromEntries(
            data.workspace.columns
              .filter(
                (c) =>
                  c.kind === 'text' &&
                  c.id !== targetKey &&
                  source.columns.some((s) => s.id === c.id),
              )
              .map((c) => [c.id, c.id]),
          ),
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Destination failed.');
    } finally {
      setBusy(false);
    }
  }
  function change(patch: Partial<TableTransferRule>) {
    setRule((r) => (r ? { ...r, ...patch } : r));
    setPreview(undefined);
  }
  const ruleSaved = Boolean(
    rule &&
    JSON.stringify(source.tableTransfers?.find((r) => r.id === rule.id)) ===
      JSON.stringify(rule),
  );
  async function request(apply: boolean) {
    if (!rule) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: source.id,
          ruleId: rule.id,
          rowIds,
          apply,
          sourceRevision: preview?.sourceRevision,
          targetRevision: preview?.targetRevision,
        }),
      });
      const data = (await r.json()) as {
        error?: string;
        preview?: Preview;
        receipt?: (typeof history)[number];
      };
      if (!r.ok) throw new Error(data.error ?? 'Transfer failed.');
      if (data.preview) {
        setPreview(data.preview);
        setPreviewScope(scopeKey);
      }
      if (data.receipt) {
        setHistory((h) => [data.receipt!, ...h].slice(0, 10));
        setPreview(undefined);
        setError(
          `Transfer saved: ${data.receipt.added} added, ${data.receipt.updated} updated, ${data.receipt.review} need review.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transfer failed.');
      setPreview(undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" disabled={!saved} onClick={() => void load()}>
        Transfer to table
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="template-dialog">
          <DialogHeader>
            <DialogTitle>Repeatable table transfer</DialogTitle>
            <DialogDescription>
              Save a field mapping, preview changes and apply them to another
              table. Unmapped destination fields stay unchanged. Duplicate or
              missing keys are flagged for review.
            </DialogDescription>
          </DialogHeader>
          <label>
            Saved rule
            <select
              value={ruleSaved ? rule?.id : ''}
              disabled={busy}
              onChange={(e) => {
                const r = source.tableTransfers?.find(
                  (r) => r.id === e.target.value,
                );
                if (r) void chooseTarget(r.targetTableId, r);
              }}
            >
              <option value="">Choose a saved rule</option>
              {source.tableTransfers?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destination
            <select
              value={rule?.targetTableId ?? ''}
              disabled={busy}
              onChange={(e) => void chooseTarget(e.target.value)}
            >
              <option value="">Choose another table</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {rule && target ? (
            <>
              <label>
                Rule name
                <input
                  value={rule.name}
                  onChange={(e) => change({ name: e.target.value })}
                />
              </label>
              <div className="http-output-grid">
                <label>
                  Source match key
                  <select
                    value={rule.sourceKey}
                    onChange={(e) => change({ sourceKey: e.target.value })}
                  >
                    {source.columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Destination match key
                  <select
                    value={rule.targetKey}
                    onChange={(e) => {
                      const mapping = { ...rule.mapping };
                      delete mapping[e.target.value];
                      change({ targetKey: e.target.value, mapping });
                    }}
                  >
                    {target.columns
                      .filter((c) => c.kind === 'text')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Match rule
                  <select
                    value={rule.normalization}
                    onChange={(e) =>
                      change({
                        normalization: e.target
                          .value as TableTransferRule['normalization'],
                      })
                    }
                  >
                    <option value="exact">Exact text</option>
                    <option value="text">Trimmed, case-insensitive text</option>
                    <option value="domain">Normalized domain</option>
                  </select>
                </label>
                <label>
                  Transfer mode
                  <select
                    value={rule.mode}
                    onChange={(e) =>
                      change({
                        mode: e.target.value as TableTransferRule['mode'],
                      })
                    }
                  >
                    <option value="upsert">
                      Add missing and update matches
                    </option>
                    <option value="add">Add missing only</option>
                    <option value="update">Update matches only</option>
                  </select>
                </label>
              </div>
              <div className="http-output-grid">
                <label>
                  Rows to send
                  <select
                    value={rule.rowScope ?? 'source'}
                    onChange={(e) =>
                      change({
                        rowScope: e.target
                          .value as TableTransferRule['rowScope'],
                      })
                    }
                  >
                    <option value="source">Source rows</option>
                    <option value="children">
                      Generated children of source rows
                    </option>
                    <option value="source_and_children">
                      Source rows and their generated children
                    </option>
                  </select>
                </label>
                {rule.rowScope && rule.rowScope !== 'source' ? (
                  <label>
                    List recipe
                    <select
                      value={rule.childRecipeId ?? ''}
                      onChange={(e) =>
                        change({ childRecipeId: e.target.value })
                      }
                    >
                      <option value="">Choose list recipe</option>
                      {source.columns
                        .filter((c) => c.outputCardinality === 'list')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  Only send rows where
                  <select
                    value={rule.condition?.field ?? ''}
                    onChange={(e) =>
                      change({
                        condition: e.target.value
                          ? { field: e.target.value, operator: 'is_not_empty' }
                          : undefined,
                      })
                    }
                  >
                    <option value="">No condition</option>
                    {source.columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                {rule.condition ? (
                  <>
                    <label>
                      Condition
                      <select
                        value={rule.condition.operator}
                        onChange={(e) =>
                          change({
                            condition: {
                              ...rule.condition!,
                              operator: e.target.value as NonNullable<
                                TableTransferRule['condition']
                              >['operator'],
                            },
                          })
                        }
                      >
                        {[
                          'is_not_empty',
                          'is_empty',
                          'equals',
                          'not_equals',
                          'contains',
                          'not_contains',
                        ].map((op) => (
                          <option key={op} value={op}>
                            {op.replaceAll('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!['is_empty', 'is_not_empty'].includes(
                      rule.condition.operator,
                    ) ? (
                      <label>
                        Value
                        <input
                          value={rule.condition.value ?? ''}
                          onChange={(e) =>
                            change({
                              condition: {
                                ...rule.condition!,
                                value: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}
              </div>
              <p>
                Conditions use trimmed, case-insensitive text. Generated-row
                routing uses current children of the selected parents; each
                saved rule is an independent branch.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={rule.skipBlank}
                  onChange={(e) => change({ skipBlank: e.target.checked })}
                />
                Skip blank source values
              </label>
              <div className="http-output-grid">
                {target.columns
                  .filter((c) => c.kind === 'text' && c.id !== rule.targetKey)
                  .map((c) => (
                    <label key={c.id}>
                      {c.title}
                      <select
                        value={rule.mapping[c.id] ?? ''}
                        onChange={(e) =>
                          change({
                            mapping: {
                              ...rule.mapping,
                              [c.id]: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="">Do not transfer</option>
                        {source.columns.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
              </div>
              <Button
                variant="outline"
                disabled={busy || !saved}
                onClick={() => {
                  try {
                    onSave(saveTransferRule(source, target, rule));
                    setPreview(undefined);
                    setError(
                      'Rule updated; wait for the table to finish saving before previewing.',
                    );
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Rule invalid.');
                  }
                }}
              >
                Save rule
              </Button>{' '}
              <Button
                variant="outline"
                disabled={busy || !saved || !ruleSaved}
                onClick={() => {
                  onSave({
                    ...source,
                    tableTransfers: source.tableTransfers?.filter(
                      (r) => r.id !== rule.id,
                    ),
                    updatedAt: Date.now(),
                  });
                  setRule(undefined);
                  setPreview(undefined);
                }}
              >
                Delete saved rule
              </Button>
              <label>
                <input
                  type="checkbox"
                  checked={useSelection}
                  disabled={!selectedRowIds.length || busy}
                  onChange={(e) => {
                    setUseSelection(e.target.checked);
                    setPreview(undefined);
                  }}
                />
                Use {selectedRowIds.length} selected rows (otherwise all source
                rows)
              </label>
              <p>
                Adding or updating rows pauses an active destination schedule.
                Transfers do not call external providers. Saved rules are manual
                reruns, not automatic synchronization.
              </p>
              <Button
                disabled={
                  busy ||
                  !saved ||
                  !ruleSaved ||
                  (useSelection && !selectedRowIds.length)
                }
                onClick={() => void request(false)}
              >
                Preview transfer
              </Button>
              {preview ? (
                <>
                  <p>
                    Showing up to 20 row changes and 500 characters per value.
                    Totals cover the full scope.
                  </p>
                  <output>
                    {preview.added} add · {preview.updated} update ·{' '}
                    {preview.skipped} skip · {preview.review} review
                  </output>
                  <div className="http-request-preview">
                    {preview.changes.slice(0, 20).map((c, i) => (
                      <details key={`${c.sourceRowId}-${i}`}>
                        <summary>
                          {c.sourceRowId}: {c.action} · {c.reason}
                        </summary>
                        <pre>
                          {JSON.stringify(
                            { before: c.before, after: c.after },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    ))}
                  </div>
                  <Button
                    disabled={
                      busy ||
                      !saved ||
                      !ruleSaved ||
                      previewScope !== scopeKey ||
                      (!preview.added && !preview.updated)
                    }
                    onClick={() => void request(true)}
                  >
                    Apply preview to {target.name}
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          {history.length ? (
            <details>
              <summary>Recent transfers</summary>
              {history.map((r) => (
                <p key={r.id}>
                  {r.ruleName} · {new Date(r.createdAt).toLocaleString()} ·{' '}
                  {r.added} added · {r.updated} updated · {r.review} review
                </p>
              ))}
            </details>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
