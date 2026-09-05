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
import {
  saveSignalWatch,
  type SignalBatch,
  type SignalKind,
} from '@/lib/change-signals';
import {
  addSignalResearch,
  enableSignalFeedFields,
} from '@/lib/account-signals';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
export default function ChangeSignals({
  workspace,
  ready,
  onSave,
  onOpenRow,
}: {
  workspace: WorkspaceSnapshot;
  ready: boolean;
  onSave: (w: WorkspaceSnapshot) => void;
  onOpenRow: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [kind, setKind] = useState<SignalKind>('field');
  const [mode, setMode] = useState<'value' | 'set'>('value');
  const [sourceColumnId, setSourceColumnId] = useState('');
  const [focus, setFocus] = useState('');
  const [columnId, setColumnId] = useState(''),
    [name, setName] = useState(''),
    [ignoreEmpty, setIgnoreEmpty] = useState(true);
  const [batches, setBatches] = useState<
      (SignalBatch & { reviewedAt: number | null })[]
    >([]),
    [unreviewed, setUnreviewed] = useState(0),
    [cursor, setCursor] = useState<string>();
  async function load(older = false) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(
        `/api/signals?workspaceId=${encodeURIComponent(workspace.id)}${older && cursor ? '&before=' + encodeURIComponent(cursor) : ''}`,
      );
      const d = (await r.json()) as {
        batches: typeof batches;
        unreviewed: number;
        nextCursor?: string;
        error?: string;
      };
      if (!r.ok) throw new Error(d.error ?? 'Signals could not be loaded.');
      setBatches((previous) =>
        older
          ? [
              ...previous,
              ...d.batches.filter((b) => !previous.some((p) => p.id === b.id)),
            ]
          : d.batches,
      );
      setUnreviewed(d.unreviewed);
      setCursor(d.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signal load failed.');
    } finally {
      setBusy(false);
    }
  }
  async function review(id: string, reviewed: boolean) {
    setBusy(true);
    try {
      const r = await fetch('/api/signals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          batchId: id,
          reviewed,
        }),
      });
      if (!r.ok) throw new Error('Review state could not be saved.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        disabled={!ready}
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        Change signals
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="template-dialog">
          <DialogHeader>
            <DialogTitle>Account signals</DialogTitle>
            <DialogDescription>
              Follow hiring, leadership, technology and reported intent in one
              account feed. Research and provider refreshes establish the first
              baseline; later observations show changes. Observation time is
              different from the date a hire or technology change happened.
            </DialogDescription>
          </DialogHeader>
          <label>
            <input
              type="checkbox"
              checked={workspace.signalFeedFields === true}
              disabled={!ready || busy}
              onChange={(e) => {
                try {
                  onSave(enableSignalFeedFields(workspace, e.target.checked));
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : 'Signal fields could not be added.',
                  );
                }
              }}
            />
            Make latest signal and tags available to recipes and CRM mappings
          </label>
          <p>
            Five table fields refresh before each recipe run, including
            scheduled runs. Use them in qualification, formulas or saved CRM
            mappings. Disabling refresh retains the last values.
          </p>
          <details>
            <summary>Add a repeatable research check</summary>
            <label>
              Roles or teams to focus on (optional)
              <input
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="HubSpot admin, SDR manager, revenue operations"
              />
            </label>
            {(['hiring', 'leadership'] as const).map((type) => (
              <Button
                key={type}
                variant="outline"
                disabled={!ready || busy}
                onClick={() => {
                  try {
                    onSave(addSignalResearch(workspace, type, focus));
                    setError(
                      'Research columns and a watch added. Run the column to establish a baseline.',
                    );
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : 'Research setup failed.',
                    );
                  }
                }}
              >
                Add {type} research
              </Button>
            ))}
            <p>
              Uses your configured research provider and normal spending rules.
              Open recipe settings to edit the question or add qualification.
              Research discoveries do not prove a complete inventory;
              disappearing results are not treated as departures or closed jobs.
            </p>
          </details>
          <details>
            <summary>
              Watched fields ({workspace.signalWatches?.length ?? 0}/10)
            </summary>
            {(workspace.signalWatches ?? []).map((w) => (
              <div key={w.id}>
                {w.name} ·{' '}
                {workspace.columns.find((c) => c.id === w.columnId)?.title ??
                  'Missing column'}{' '}
                ·{' '}
                {w.ignoreEmpty ? 'nonempty changes' : 'includes blank changes'}
                <Button
                  variant="outline"
                  disabled={!ready || busy}
                  onClick={() =>
                    onSave({
                      ...workspace,
                      signalWatches: workspace.signalWatches?.filter(
                        (x) => x.id !== w.id,
                      ),
                      updatedAt: Date.now(),
                    })
                  }
                >
                  Remove watch
                </Button>
              </div>
            ))}
            <label>
              Field
              <select
                value={columnId}
                onChange={(e) => {
                  setColumnId(e.target.value);
                  setName(
                    workspace.columns.find((c) => c.id === e.target.value)
                      ?.title ?? '',
                  );
                }}
              >
                <option value="">Choose a field</option>
                {workspace.columns
                  .filter((c) => c.kind !== 'status')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
              </select>
            </label>
            <div className="lookup-fields">
              <label>
                Signal category
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as SignalKind)}
                >
                  {[
                    'field',
                    'hiring',
                    'leadership',
                    'technology',
                    'website',
                    'g2',
                    'linkedin',
                  ].map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Comparison
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as 'value' | 'set')}
                >
                  <option value="value">Whole value changed</option>
                  <option value="set">Items added or no longer reported</option>
                </select>
              </label>
              <label>
                Source URL column (optional)
                <select
                  value={sourceColumnId}
                  onChange={(e) => setSourceColumnId(e.target.value)}
                >
                  <option value="">Use run provenance</option>
                  {workspace.columns
                    .filter((c) => c.kind !== 'status')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              Watch name
              <input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={ignoreEmpty}
                onChange={(e) => setIgnoreEmpty(e.target.checked)}
              />
              Ignore changes to or from an empty value
            </label>
            <Button
              disabled={!ready || busy || !columnId || !name.trim()}
              onClick={() => {
                try {
                  onSave(
                    saveSignalWatch(workspace, {
                      id: crypto.randomUUID(),
                      name,
                      columnId,
                      ignoreEmpty,
                      kind,
                      mode,
                      sourceColumnId: sourceColumnId || undefined,
                    }),
                  );
                  setError(
                    'Watch saved. Future workflow changes will appear here.',
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Watch failed.');
                }
              }}
            >
              Add watch
            </Button>
          </details>
          <p>
            Website, G2 and LinkedIn events can enter through a configured
            signal webhook. The feed records the supplied source and event date;
            source access must be connected separately.
          </p>
          <p>{unreviewed} unreviewed change batches</p>
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            Refresh signals
          </Button>
          {batches.map((batch) => (
            <details key={batch.id}>
              <summary>
                {batch.reviewedAt ? 'Reviewed' : 'New'} · {batch.origin} ·{' '}
                {batch.totalChanges} changes ·{' '}
                {new Date(batch.createdAt).toLocaleString()}
              </summary>
              {batch.omittedChanges ? (
                <p>
                  {batch.omittedChanges} additional changes are counted but not
                  individually retained. This batch displays its first 200
                  changes.
                </p>
              ) : null}
              <table>
                <thead>
                  <tr>
                    <th>Row / watch</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.events.map((event, i) => (
                    <tr key={i}>
                      <td>
                        <Button
                          variant="ghost"
                          disabled={
                            !ready ||
                            !workspace.rows.some((r) => r.id === event.rowId)
                          }
                          onClick={() => {
                            setOpen(false);
                            onOpenRow(event.rowId);
                          }}
                        >
                          {event.rowLabel}
                        </Button>
                        <br />
                        {event.watchName} · {event.kind ?? 'field'}
                        {event.change ? (
                          <small>
                            {event.change === 'added'
                              ? 'Newly observed'
                              : event.change === 'removed'
                                ? 'No longer reported'
                                : event.change === 'reported'
                                  ? 'Reported activity'
                                  : 'Changed'}
                          </small>
                        ) : null}
                        {event.sourceUrl ? (
                          <a
                            href={event.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Source
                          </a>
                        ) : null}
                        {event.occurredAt ? (
                          <small>
                            Event: {new Date(event.occurredAt).toLocaleString()}
                          </small>
                        ) : null}
                        {event.truncated
                          ? ' (value shortened to 500 characters)'
                          : ''}
                      </td>
                      <td>{event.before || '(empty)'}</td>
                      <td>{event.after || '(empty)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void review(batch.id, !batch.reviewedAt)}
              >
                {batch.reviewedAt ? 'Mark unreviewed' : 'Mark reviewed'}
              </Button>
            </details>
          ))}
          {cursor ? (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => void load(true)}
            >
              Load older signals
            </Button>
          ) : null}
          {!batches.length ? (
            <p>
              No observed changes yet. Configure a watch and run or schedule a
              refresh.
            </p>
          ) : null}
          {error ? <output>{error}</output> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
