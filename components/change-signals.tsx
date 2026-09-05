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
import { saveSignalWatch, type SignalBatch } from '@/lib/change-signals';
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
            <DialogTitle>Change signals</DialogTitle>
            <DialogDescription>
              Watch fields for changes observed by recipe runs, scheduled API
              refreshes and table transfers. New rows establish a baseline.
              Manual grid edits and external events that have not been fetched
              are not monitored.
            </DialogDescription>
          </DialogHeader>
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
                        {event.watchName}
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
