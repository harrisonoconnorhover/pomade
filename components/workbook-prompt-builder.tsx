'use client';
import { useRef, useState } from 'react';
import { Sparkles, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import type { WorkbookPlan } from '@/lib/workbook-planner';
import { DEMANDDRIVE_EXAMPLE } from '@/lib/workbook-examples';
import type { TableSummary } from '@/lib/workbook';

export default function WorkbookPromptBuilder({
  disabled,
  onBusy,
  onCreated,
}: {
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onCreated: (tables: TableSummary[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState('');
  const [plan, setPlan] = useState<WorkbookPlan>();
  const [previewTables, setPreviewTables] = useState<TableSummary[]>([]);
  const [busy, setBusy] = useState<'planning' | 'creating'>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [provider, setProvider] = useState('');
  const creationId = useRef('');
  const attempt = useRef(0);
  const frozenRequest = useRef('');
  async function generate() {
    const currentAttempt = ++attempt.current;
    frozenRequest.current = request.trim();
    creationId.current = crypto.randomUUID();
    setBusy('planning');
    onBusy(true);
    setError('');
    setPlan(undefined);
    setPreviewTables([]);
    setMessage('Designing the sheets, columns and research steps…');
    try {
      for (let poll = 0; poll < 72; poll++) {
        const response = await fetch('/api/workbook-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'plan',
            request: frozenRequest.current,
          }),
        });
        const data = (await response.json()) as {
          error?: string;
          pending?: boolean;
          message?: string;
          plan?: WorkbookPlan;
          tables?: TableSummary[];
          provider?: string;
          model?: string;
        };
        if (attempt.current !== currentAttempt) return;
        if (!response.ok)
          throw new Error(data.error || 'The workbook could not be planned.');
        if (data.pending) {
          setMessage(data.message || 'Waiting for your Mac…');
          await new Promise((resolve) => setTimeout(resolve, 5000));
          if (attempt.current !== currentAttempt) return;
          continue;
        }
        if (!data.plan || !data.tables)
          throw new Error('The planner did not return a complete workbook.');
        setPlan(data.plan);
        setPreviewTables(data.tables);
        setProvider([data.provider, data.model].filter(Boolean).join(' · '));
        return;
      }
      throw new Error(
        'Planning is still waiting for your Mac. Check that the companion is running, then try again to pick up the result.',
      );
    } catch (e) {
      if (attempt.current === currentAttempt)
        setError(e instanceof Error ? e.message : 'Planning failed.');
    } finally {
      if (attempt.current === currentAttempt) {
        setBusy(undefined);
        onBusy(false);
        setMessage('');
      }
    }
  }
  async function create() {
    if (!plan) return;
    setBusy('creating');
    onBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workbook-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          request: frozenRequest.current,
          plan,
          creationId: creationId.current,
        }),
      });
      const data = (await response.json()) as {
        tables?: TableSummary[];
        error?: string;
      };
      if (!response.ok || !data.tables?.length)
        throw new Error(data.error || 'The workbook could not be created.');
      onCreated(data.tables);
      setOpen(false);
      setPlan(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Creation failed.');
    } finally {
      setBusy(undefined);
      onBusy(false);
    }
  }
  function close() {
    if (busy === 'creating') return;
    attempt.current++;
    setBusy(undefined);
    onBusy(false);
    setOpen(false);
  }
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          setError('');
        }}
      >
        <Sparkles /> Build from a prompt
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => (value ? setOpen(true) : close())}
      >
        <DialogContent className="template-dialog workbook-prompt-dialog">
          <DialogHeader>
            <DialogTitle>Turn a request into a workbook</DialogTitle>
            <DialogDescription>
              Paste a project brief. Pomade proposes the sheets, research
              columns, scoring and routes between them.
            </DialogDescription>
          </DialogHeader>
          <label className="workbook-prompt-label" htmlFor="workbook-request">
            What would you like to build?
          </label>
          <textarea
            id="workbook-request"
            rows={7}
            maxLength={5000}
            value={request}
            disabled={Boolean(busy)}
            placeholder="Find companies matching this ICP, research three buying signals, score them, and map the buying committee in a separate sheet…"
            onChange={(e) => {
              setRequest(e.target.value);
              setPlan(undefined);
            }}
          />
          <div className="workbook-prompt-controls">
            <Button
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={() => {
                setRequest(DEMANDDRIVE_EXAMPLE);
                setPlan(undefined);
              }}
            >
              Use DemandDrive example
            </Button>
            <span>{request.length.toLocaleString()} / 5,000</span>
          </div>
          <p className="workbook-prompt-note">
            Planning uses one request through your connected ChatGPT account and
            saved model settings. The workbook’s research steps run when you
            start them.
          </p>
          {message ? (
            <output>
              <LoaderCircle className="spin" size={16} /> {message}
            </output>
          ) : null}
          {error ? (
            <p className="template-error" role="alert">
              {error}
            </p>
          ) : null}
          {plan ? (
            <section
              className="workbook-plan-preview"
              aria-label="Proposed workbook"
            >
              <h3>{plan.name}</h3>
              <p>{plan.summary}</p>
              <p className="workbook-prompt-note">
                {previewTables.length} sheets ·{' '}
                {previewTables.reduce((n, t) => n + t.columnCount, 0)} columns ·{' '}
                {provider}
              </p>
              <ol>
                {plan.tables.map((table, index) => (
                  <li key={table.key}>
                    <strong>{table.name}</strong>
                    <p>{table.purpose}</p>
                    <p className="workbook-prompt-note">
                      {previewTables[index]?.columnCount} columns
                      {index === 0
                        ? ' · Starts from your request'
                        : ' · Filled by the preceding route'}
                    </p>
                    {table.steps.map((step) => (
                      <details key={step.id}>
                        <summary>
                          {step.title} ·{' '}
                          {step.kind === 'score'
                            ? 'Local scoring'
                            : step.mode === 'list'
                              ? `List research · up to ${step.limit} results`
                              : 'Web research'}
                        </summary>
                        {step.kind === 'research' ? (
                          <>
                            <p>{step.prompt}</p>
                            <p>
                              Outputs:{' '}
                              {step.outputs.map((f) => f.title).join(', ')}
                            </p>
                          </>
                        ) : (
                          <p>
                            {step.inputs
                              .map(
                                (i) =>
                                  `${i.field}: up to ${i.maxPoints} points${i.minimumPoints ? `; requires ${i.minimumPoints}+` : ''}`,
                              )
                              .join(' · ')}
                            . High: {step.highAt}+, Medium: {step.mediumAt}+.
                          </p>
                        )}
                      </details>
                    ))}
                    {plan.transfers
                      .filter((t) => t.from === table.key)
                      .map((t) => (
                        <p key={t.to} className="workbook-plan-route">
                          → {t.name}:{' '}
                          {plan.tables.find((next) => next.key === t.to)?.name}
                        </p>
                      ))}
                  </li>
                ))}
              </ol>
              {plan.assumptions.length ? (
                <details>
                  <summary>Assumptions</summary>
                  <ul>
                    {plan.assumptions.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {plan.manualTasks.length ? (
                <div className="workbook-manual-tasks">
                  <strong>Separate steps</strong>
                  <ul>
                    {plan.manualTasks.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
          <div className="workbook-prompt-actions">
            <Button
              variant="outline"
              disabled={Boolean(busy) || !request.trim()}
              onClick={() => void generate()}
            >
              {busy === 'planning'
                ? 'Planning…'
                : plan
                  ? 'Replan request'
                  : 'Plan workbook'}
            </Button>
            {plan ? (
              <Button
                disabled={Boolean(busy) || disabled}
                onClick={() => void create()}
              >
                {busy === 'creating'
                  ? 'Creating…'
                  : `Create ${plan.tables.length} ${plan.tables.length === 1 ? 'sheet' : 'sheets'}`}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
