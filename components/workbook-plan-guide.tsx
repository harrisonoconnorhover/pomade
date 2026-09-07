'use client';
import { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  Check,
  ArrowRight,
  CircleAlert,
  LoaderCircle,
  X,
} from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
import { workbookRunPercent, type WorkbookRun } from '@/lib/workbook-run';

type TransferPreview = {
  sourceRevision: number;
  targetRevision: number;
  added: number;
  updated: number;
  skipped: number;
  review: number;
};
export default function WorkbookPlanGuide({
  workspace,
  ready,
  onRun,
  onOpenTable,
  onBusyChange,
}: {
  workspace: WorkspaceSnapshot;
  ready: boolean;
  onRun: (columnId: string) => void;
  onOpenTable: (tableId: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [launch, setLaunch] = useState(false);
  const [maxRows, setMaxRows] = useState(100),
    [maxRequests, setMaxRequests] = useState(100);
  const [run, setRun] = useState<WorkbookRun | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    data: TransferPreview;
  }>();
  const plan = workspace.workbookPlan;
  const planId = plan?.id;
  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch(
          `/api/workbook-runs?workbookId=${encodeURIComponent(planId!)}`,
        );
        if (!response.ok) return;
        const data = (await response.json()) as { run: WorkbookRun | null };
        if (!cancelled) setRun(data.run);
      } catch {
        /* Retain last known progress while reconnecting. */
      }
    }
    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [planId]);
  useEffect(() => {
    onBusyChange(run?.status === 'running');
    return () => onBusyChange(false);
  }, [run?.status, onBusyChange]);
  if (!plan) return null;
  const active = run && !['completed', 'cancelled'].includes(run.status);
  async function updateRun(command: 'start' | 'pause' | 'resume' | 'cancel') {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/workbook-runs', {
        method: command === 'start' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          command === 'start'
            ? {
                workspaceId: workspace.id,
                maxRows,
                maxExternalRequests: maxRequests,
                confirmRequests: true,
              }
            : {
                id: run?.id,
                action: command,
                ...(command === 'resume'
                  ? {
                      maxExternalRequests: Math.max(
                        maxRequests,
                        run?.maxExternalRequests ?? 0,
                      ),
                    }
                  : {}),
              },
        ),
      });
      const data = (await response.json()) as {
        run?: WorkbookRun;
        error?: string;
      };
      if (!response.ok || !data.run)
        throw new Error(data.error || 'The workbook could not be updated.');
      setRun(data.run);
      setLaunch(false);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'The run could not be updated.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function transfer(id: string, apply: boolean) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: workspace.id,
          ruleId: id,
          apply,
          ...(apply && preview?.id === id
            ? {
                sourceRevision: preview.data.sourceRevision,
                targetRevision: preview.data.targetRevision,
              }
            : {}),
        }),
      });
      const data = (await response.json()) as {
        preview?: TransferPreview;
        receipt?: TransferPreview;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || 'The route could not be applied.');
      if (data.preview) setPreview({ id, data: data.preview });
      if (data.receipt) {
        setPreview(undefined);
        setMessage(
          `${data.receipt.added} rows added, ${data.receipt.updated} updated.`,
        );
      }
    } catch (e) {
      setPreview(undefined);
      setMessage(e instanceof Error ? e.message : 'Transfer failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={`workbook-control ${run?.status === 'needs_attention' ? 'workbook-control-attention' : ''}`}
      aria-label="Workbook runner"
    >
      <div className="workbook-control-heading">
        <div>
          <span className="eyebrow">
            WORKBOOK · {plan.tables.length} SHEETS
          </span>
          <strong>{plan.name}</strong>
          <p aria-live="polite">
            {run?.status === 'completed'
              ? `Run finished.${run.reviewRows ? ` ${run.reviewRows} rows need review.` : ''} Results are saved in the linked sheets.`
              : active
                ? `${run!.status === 'paused' ? 'Paused · ' : run!.status === 'needs_attention' ? 'Needs attention · ' : ''}Step ${Math.min(run!.cursor + 1, run!.steps.length)} of ${run!.steps.length}: ${run!.steps[run!.cursor]?.title ?? 'Finishing'}`
                : `${plan.steps.length} connected steps · Research, score, and route results across sheets.`}
          </p>
        </div>
        <div className="workbook-control-actions">
          {active ? (
            <>
              {run!.status === 'running' ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void updateRun('pause')}
                >
                  <Pause /> Pause
                </Button>
              ) : (
                <Button
                  disabled={busy || !ready}
                  onClick={() => void updateRun('resume')}
                >
                  <Play /> Resume
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void updateRun('cancel')}
              >
                <X /> Cancel run
              </Button>
            </>
          ) : (
            <Button
              disabled={!ready || busy}
              onClick={() => {
                setMessage('');
                setLaunch(true);
              }}
            >
              <Play />{' '}
              {run?.status === 'completed' ? 'Run again' : 'Run workbook'}
            </Button>
          )}
        </div>
      </div>
      {run ? (
        <div className="workbook-progress">
          <progress
            max={100}
            value={workbookRunPercent(run)}
            aria-label="Workbook progress"
          />
          <span>{workbookRunPercent(run)}%</span>
        </div>
      ) : null}
      {run?.lastError && active ? (
        <div className="workflow-error" role="alert">
          <CircleAlert />
          <span>{run.lastError}</span>
          {run.lastError.includes('request limit') ? (
            <label>
              New request limit
              <input
                type="number"
                min={run.reservedRequests}
                max={1000}
                value={maxRequests}
                onChange={(e) => setMaxRequests(Number(e.target.value))}
              />
            </label>
          ) : null}
        </div>
      ) : null}
      {message ? <output className="workflow-message">{message}</output> : null}
      <details className="workbook-plan-guide">
        <summary>
          Steps and linked sheets{' '}
          <span>{plan.tables.map((t) => t.name).join(' → ')}</span>
        </summary>
        <ol className="workbook-step-list">
          {plan.steps.map((step, index) => {
            const progress = run?.steps[index];
            return (
              <li
                key={`${step.tableId}:${step.columnId ?? step.transferId}`}
                className={
                  active && index === run!.cursor ? 'current-step' : ''
                }
              >
                <span className="step-marker">
                  {progress?.status === 'completed' ? (
                    <Check />
                  ) : active &&
                    index === run!.cursor &&
                    run!.status === 'running' ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    index + 1
                  )}
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{progress?.summary ?? step.detail}</p>
                  <button
                    type="button"
                    className="step-table-link"
                    disabled={!ready && run?.status !== 'running'}
                    onClick={() => onOpenTable(step.tableId)}
                  >
                    {plan.tables.find((t) => t.id === step.tableId)?.name}
                    <ArrowRight />
                  </button>
                </div>
                {step.tableId === workspace.id && !active ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!ready || busy}
                    onClick={() =>
                      step.columnId
                        ? onRun(step.columnId)
                        : void transfer(step.transferId!, false)
                    }
                  >
                    {step.columnId ? 'Run step' : 'Preview route'}
                  </Button>
                ) : null}
                {preview?.id === step.transferId ? (
                  <div className="workbook-route-preview">
                    <p>
                      {preview!.data.added} new · {preview!.data.updated}{' '}
                      updates · {preview!.data.review} need review
                    </p>
                    <Button
                      disabled={
                        !ready ||
                        busy ||
                        preview!.data.review > 0 ||
                        !(preview!.data.added + preview!.data.updated)
                      }
                      onClick={() => void transfer(step.transferId!, true)}
                    >
                      Transfer matching rows
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        <details className="workbook-original">
          <summary>Original request and assumptions</summary>
          <p className="workbook-original-request">{plan.request}</p>
          {plan.assumptions.length ? (
            <ul>
              {plan.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : null}
          {plan.manualTasks.length ? (
            <>
              <strong>Separate steps</strong>
              <ul>
                {plan.manualTasks.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </>
          ) : null}
        </details>
      </details>
      <Dialog open={launch} onOpenChange={setLaunch}>
        <DialogContent className="template-dialog workbook-launch-dialog">
          <DialogHeader>
            <DialogTitle>Run {plan.name}</DialogTitle>
            <DialogDescription>
              Pomade follows all {plan.steps.length} steps across{' '}
              {plan.tables.length} sheets. It saves progress between steps and
              stops if a route needs review or a provider fails.
            </DialogDescription>
          </DialogHeader>
          <div className="workflow-form-grid">
            <label>
              Maximum rows per sheet
              <input
                type="number"
                min={1}
                max={500}
                value={maxRows}
                onChange={(e) => setMaxRows(Number(e.target.value))}
              />
            </label>
            <label>
              Maximum provider requests
              <input
                type="number"
                min={1}
                max={1000}
                value={maxRequests}
                onChange={(e) => setMaxRequests(Number(e.target.value))}
              />
            </label>
          </div>
          <p>
            Provider requests use your connected accounts and allowances. This
            is a request limit, not a dollar limit; cached or skipped lookups
            may use less. Rows found later count toward the same limit. Keep
            your Mac awake for local runs and ChatGPT research.
          </p>
          <p>
            Rerunning uses existing research caches where available. CRM writes
            remain in your saved CRM actions.
          </p>
          {message ? <p role="alert">{message}</p> : null}
          <Button
            disabled={busy || !ready}
            onClick={() => void updateRun('start')}
          >
            {busy ? <LoaderCircle className="spin" /> : <Play />} Start workbook
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
