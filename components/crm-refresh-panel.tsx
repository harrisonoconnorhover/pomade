'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, CalendarClock, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { savedCrmSource, type reviewCrmImport } from '@/lib/crm-import';
import type { CrmRefreshState } from '@/lib/crm-refresh';
import type { CrmSourcePreview, WorkspaceSnapshot } from '@/lib/pomade-types';
import CrmImportReview from './crm-import-review';
const when = (time?: number) =>
  time ? new Date(time).toLocaleString() : 'Not refreshed yet';
export default function CrmRefreshPanel({
  workspace,
  ready,
  hosted,
  onRefresh,
}: {
  workspace: WorkspaceSnapshot;
  ready: boolean;
  hosted: boolean;
  onRefresh: (workspace: WorkspaceSnapshot) => void;
}) {
  const [state, setState] = useState<CrmRefreshState | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [cadence, setCadence] = useState<CrmRefreshState['cadence']>('manual'),
    [maxRecords, setMaxRecords] = useState(500);
  const [preview, setPreview] = useState<{
    preview: CrmSourcePreview;
    review: ReturnType<typeof reviewCrmImport>;
  }>();
  const source = savedCrmSource(workspace);
  const hasSource = Boolean(source);
  useEffect(() => {
    if (!hasSource) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(
          `/api/crm-refresh?workspaceId=${encodeURIComponent(workspace.id)}`,
        );
        const data = (await r.json()) as { state: CrmRefreshState | null };
        if (r.ok && !cancelled) setState(data.state);
      } catch {
        /* Last known state remains visible. */
      }
    };
    void poll();
    const timer = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [workspace.id, hasSource]);
  if (!source) return null;
  async function request(action: 'refresh' | 'preview' | 'configure') {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/crm-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          action,
          ...(action === 'refresh' ? {} : { cadence, maxRecords }),
        }),
      });
      const data = (await r.json()) as {
        state?: CrmRefreshState;
        workspace?: WorkspaceSnapshot;
        error?: string;
        preview?: CrmSourcePreview;
        review?: ReturnType<typeof reviewCrmImport>;
      };
      if (!r.ok)
        throw new Error(data.error ?? 'The CRM could not be refreshed.');
      if (data.state) setState(data.state);
      if (data.workspace) {
        onRefresh(data.workspace);
        setPreview(undefined);
      }
      if (data.preview && data.review)
        setPreview({ preview: data.preview, review: data.review });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CRM refresh failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="crm-source-bar" aria-label="Saved CRM source">
      <RefreshCw />
      <div>
        <strong>{workspace.source?.label}</strong>
        <small>
          {state?.status === 'failed'
            ? 'Refresh needs attention'
            : state?.status === 'running'
              ? 'Refreshing source…'
              : `Last read ${when(state?.lastRunAt ?? workspace.source?.importedAt)}`}
          {state?.nextRunAt ? ` · Next ${when(state.nextRunAt)}` : ''}
        </small>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={!ready || busy || state?.status === 'running'}
        onClick={() => void request('refresh')}
      >
        {busy ? <LoaderCircle className="spin" /> : <RefreshCw />} Refresh now
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setCadence(state?.cadence ?? 'manual');
          setMaxRecords(state?.maxRecords ?? 500);
          setOpen(true);
        }}
      >
        <CalendarClock /> Refresh settings
      </Button>
      {error ? <output role="alert">{error}</output> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="template-dialog crm-refresh-dialog">
          <DialogHeader>
            <DialogTitle>Keep this CRM source current</DialogTitle>
            <DialogDescription>
              {workspace.source?.label}. Refresh updates CRM fields, adds new
              records, and preserves your research, scores, and existing rows.
            </DialogDescription>
          </DialogHeader>
          <div className="workflow-form-grid">
            <label>
              Refresh automatically
              <select
                value={cadence}
                onChange={(e) =>
                  setCadence(e.target.value as CrmRefreshState['cadence'])
                }
              >
                <option value="manual">Only when I click refresh</option>
                <option value="every_day">Every day</option>
                <option value="every_week">Every week</option>
              </select>
            </label>
            <label>
              Maximum records per refresh
              <input
                type="number"
                min={1}
                max={1000}
                value={maxRecords}
                onChange={(e) => setMaxRecords(Number(e.target.value))}
              />
            </label>
          </div>
          <p>
            {hosted
              ? 'This hosted copy refreshes while Pomade is open or your Mac connection is running. Missed refreshes catch up when either reconnects.'
              : 'Automatic refresh runs while Pomade and its local scheduler are running on your Mac.'}{' '}
            The first automatic refresh runs shortly after saving, then repeats
            at your chosen interval. Each copy keeps its own schedule.
          </p>
          <p>
            Records absent from a complete refresh are marked “No longer in
            source” and kept. Partial reads are labelled so they cannot be
            mistaken for departed records.
          </p>
          {state?.summary ? (
            <div className="refresh-stat-grid">
              <span>
                <strong>{state.summary.added}</strong>added
              </span>
              <span>
                <strong>{state.summary.updated}</strong>updated
              </span>
              <span>
                <strong>{state.summary.unchanged}</strong>unchanged
              </span>
              <span>
                <strong>{state.summary.notReturned ?? '—'}</strong>not in source
              </span>
            </div>
          ) : null}
          {state?.lastError ? <p role="alert">{state.lastError}</p> : null}
          {preview ? (
            <>
              <CrmImportReview review={preview.review} />
              <p>
                {preview.preview.truncated
                  ? 'Partial preview: the record limit was reached. Increase it or use a smaller segment.'
                  : 'Complete source preview.'}{' '}
                Refresh reads the latest values again before saving.
              </p>
            </>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          <div className="workbook-control-actions">
            <Button
              variant="outline"
              disabled={!ready || busy}
              onClick={() => void request('preview')}
            >
              Preview changes
            </Button>
            <Button
              disabled={!ready || busy}
              onClick={() => void request('configure')}
            >
              Save refresh settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
