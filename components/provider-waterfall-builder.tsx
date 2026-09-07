'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  createProviderWaterfall,
  verifiedAcceptance,
} from '@/lib/provider-waterfall';
import {
  CONTACT_INPUTS,
  CONTACT_PROVIDER_PRESETS,
  contactPreset,
  missingContactInputs,
  type ContactBindings,
  type ContactInput,
} from '@/lib/contact-provider-presets';
import type { HttpConnectionSummary } from '@/lib/http-enrichment';
import type {
  PomadeColumn,
  WorkspaceSnapshot,
  HttpProviderStep,
  ProviderWaterfall,
} from '@/lib/pomade-types';
type StepDraft = HttpProviderStep & { quickSetup?: string };
const blank = (): StepDraft => ({
  connectionId: '',
  method: 'GET',
  pathTemplate: '/enrich?domain={{domain}}',
  responsePath: 'email',
});
export default function ProviderWaterfallBuilder({
  open,
  onOpenChange,
  workspace,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: WorkspaceSnapshot;
  onAdd: (columns: PomadeColumn[]) => void;
}) {
  const [connectionResult, setConnectionResult] = useState<{
    revision: number;
    connections: HttpConnectionSummary[];
    error: string;
  }>({ revision: -1, connections: [], error: '' });
  const { connections, error } = connectionResult;
  const [title, setTitle] = useState('Provider result');
  const [steps, setSteps] = useState<StepDraft[]>([blank(), blank()]);
  const inputColumns = workspace.columns.filter(
    (column) => column.kind !== 'status',
  );
  const [bindings, setBindings] = useState<ContactBindings>(
    () =>
      Object.fromEntries(
        Object.keys(CONTACT_INPUTS).map((key) => [
          key,
          inputColumns.some((c) => c.id === key) ? key : '',
        ]),
      ) as ContactBindings,
  );
  const [accept, setAccept] = useState<ProviderWaterfall['accept']>('nonempty');
  const [continueOnError, setContinueOnError] = useState(false);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const loading = connectionResult.revision !== connectionRevision;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/providers/http')
      .then(async (r) => {
        const data = (await r.json()) as {
          connections?: HttpConnectionSummary[];
          error?: string;
        };
        if (!r.ok || !data.connections)
          throw new Error(data.error ?? 'Connections could not be loaded.');
        if (!cancelled)
          setConnectionResult({
            revision: connectionRevision,
            connections: data.connections,
            error: '',
          });
      })
      .catch((e) => {
        if (!cancelled) {
          setConnectionResult({
            revision: connectionRevision,
            connections: [],
            error: e.message,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, connectionRevision]);
  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) setConnectionRevision((value) => value + 1);
    onOpenChange(nextOpen);
  }
  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  let columns: PomadeColumn[] | undefined;
  let validation = '';
  try {
    for (const step of steps) {
      const preset = contactPreset(step.quickSetup);
      if (preset) {
        const missing = missingContactInputs(preset, bindings, inputColumns);
        if (missing.length)
          throw new Error(
            `Choose ${missing.map((key) => CONTACT_INPUTS[key].toLowerCase()).join(' and ')} for ${preset.provider}.`,
          );
        if (
          preset.inputs.includes('person') &&
          preset.inputs.includes('domain') &&
          bindings.person === bindings.domain
        )
          throw new Error(
            'Choose separate full-name and company-domain columns.',
          );
      }
    }
    columns = createProviderWaterfall(workspace, {
      id,
      title,
      steps: steps.map(({ quickSetup: _quickSetup, ...step }) => step),
      accept,
      continueOnError,
    });
    if (
      steps.some(
        (step) =>
          !step.quickSetup &&
          !connections.some(
            (c) =>
              c.id === step.connectionId && c.methods.includes(step.method),
          ),
      )
    )
      throw new Error('Select an enabled connection and method for each step.');
  } catch (e) {
    validation = e instanceof Error ? e.message : 'Invalid waterfall.';
  }
  function edit(index: number, patch: Partial<HttpProviderStep>) {
    setSteps((current) =>
      current.map((step, i) =>
        i === index ? { ...step, ...patch, quickSetup: undefined } : step,
      ),
    );
  }
  function updatePresetInput(input: ContactInput, columnId: string) {
    const next = { ...bindings, [input]: columnId };
    setBindings(next);
    setSteps((current) =>
      current.map((step) => {
        const preset = contactPreset(step.quickSetup);
        return preset ? { ...preset.step(next), quickSetup: preset.id } : step;
      }),
    );
  }
  const selectedInputKeys = new Set(
    steps.flatMap((step) => contactPreset(step.quickSetup)?.inputs ?? []),
  );
  const visibleInputs = (
    Object.entries(CONTACT_INPUTS) as [ContactInput, string][]
  ).filter(([key]) => selectedInputKeys.has(key));
  const neededConnections = [
    ...new Set(
      steps
        .filter(
          (step) =>
            step.connectionId &&
            !connections.some((c) => c.id === step.connectionId),
        )
        .map(
          (step) =>
            contactPreset(step.quickSetup)?.provider ?? step.connectionId,
        ),
    ),
  ];
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="template-dialog provider-waterfall-dialog">
        <DialogHeader>
          <DialogTitle>Provider waterfall</DialogTitle>
          <DialogDescription>
            Try providers in order and stop after the first acceptable result.
            This creates one result column, a winning-provider column and a
            status column. It does not fetch data until you run it.
          </DialogDescription>
        </DialogHeader>
        <label>
          Result column name
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <fieldset>
          <legend>Lookup inputs</legend>
          <p>Choose a preset below, then map the input columns it needs.</p>
          <div className="http-output-grid">
            {visibleInputs.map(([input, label]) => (
              <label key={input}>
                {label}
                <select
                  value={bindings[input]}
                  onChange={(e) => updatePresetInput(input, e.target.value)}
                >
                  <option value="">Choose a column</option>
                  {inputColumns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.title}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
        {loading ? (
          <output>Checking available providers…</output>
        ) : !connections.length ? (
          <p>
            You can prepare presets now. Connect a key in Account, or in your
            local server settings, before running them.
          </p>
        ) : null}
        {!loading && error ? (
          <Button
            variant="outline"
            onClick={() => setConnectionRevision((value) => value + 1)}
          >
            Check providers again
          </Button>
        ) : null}
        {steps.map((step, index) => (
          <fieldset key={index}>
            <legend>
              Attempt {index + 1}
              {step.connectionId
                ? ` · ${connections.find((connection) => connection.id === step.connectionId)?.label ?? step.connectionId}`
                : ''}
            </legend>
            <label>
              Quick setup
              <select
                aria-label={`Provider preset ${index + 1}`}
                value={step.quickSetup ?? ''}
                disabled={loading}
                onChange={(e) => {
                  if (e.target.value) {
                    const preset = contactPreset(e.target.value);
                    if (!preset) return;
                    setSteps((current) =>
                      current.map((item, i) =>
                        i === index
                          ? {
                              ...preset.step(bindings),
                              quickSetup: preset.id,
                            }
                          : item,
                      ),
                    );
                    setAccept(preset.accept);
                  } else edit(index, {});
                }}
              >
                <option value="">Custom request or choose a preset</option>
                {CONTACT_PROVIDER_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                    {connections.some((c) => c.id === preset.connectionId)
                      ? ''
                      : ' · API key needed'}
                  </option>
                ))}
              </select>
            </label>
            {contactPreset(step.quickSetup)?.note ? (
              <p>{contactPreset(step.quickSetup)?.note}</p>
            ) : null}
            <details
              className="provider-request-settings"
              open={step.quickSetup ? undefined : true}
            >
              <summary>
                {step.quickSetup
                  ? 'Advanced request settings'
                  : 'Custom request settings'}
              </summary>
              <div className="http-output-grid">
                <label>
                  Connection
                  <select
                    value={step.connectionId}
                    onChange={(e) =>
                      edit(index, { connectionId: e.target.value })
                    }
                  >
                    <option value="">Choose provider</option>
                    {step.quickSetup &&
                    !connections.some((c) => c.id === step.connectionId) ? (
                      <option value={step.connectionId}>
                        {contactPreset(step.quickSetup)?.provider} · API key
                        needed
                      </option>
                    ) : null}
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Method
                  <select
                    value={step.method}
                    onChange={(e) =>
                      edit(index, { method: e.target.value as 'GET' | 'POST' })
                    }
                  >
                    <option>GET</option>
                    <option>POST</option>
                  </select>
                </label>
                <label>
                  Relative path
                  <input
                    value={step.pathTemplate}
                    onChange={(e) =>
                      edit(index, { pathTemplate: e.target.value })
                    }
                  />
                </label>
                <label>
                  Result JSON path
                  <input
                    value={step.responsePath}
                    onChange={(e) =>
                      edit(index, { responsePath: e.target.value })
                    }
                  />
                </label>
              </div>
              {verifiedAcceptance(accept) ? (
                <div className="http-output-grid">
                  <label>
                    Verification status JSON path
                    <input
                      value={step.verification?.path ?? ''}
                      placeholder="data.verification.status"
                      onChange={(e) =>
                        edit(index, {
                          verification: {
                            path: e.target.value,
                            acceptedValues: step.verification
                              ?.acceptedValues ?? ['valid'],
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Verified status values from this provider (comma separated)
                    <input
                      value={step.verification?.acceptedValues.join(', ') ?? ''}
                      placeholder="valid"
                      onChange={(e) =>
                        edit(index, {
                          verification: {
                            path: step.verification?.path ?? '',
                            acceptedValues: e.target.value
                              .split(',')
                              .map((v) => v.trim()),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}
              {step.method === 'POST' ? (
                <label>
                  JSON body
                  <textarea
                    value={step.bodyTemplate ?? '{}'}
                    onChange={(e) =>
                      edit(index, { bodyTemplate: e.target.value })
                    }
                  />
                </label>
              ) : null}
            </details>
            <Button
              variant="outline"
              disabled={index === 0}
              onClick={() =>
                setSteps((current) => {
                  const next = [...current];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  return next;
                })
              }
            >
              Move earlier
            </Button>{' '}
            <Button
              variant="outline"
              disabled={steps.length <= 1}
              onClick={() =>
                setSteps((current) => current.filter((_, i) => i !== index))
              }
            >
              Remove step
            </Button>
          </fieldset>
        ))}
        <Button
          variant="outline"
          disabled={steps.length >= 4}
          onClick={() => setSteps((current) => [...current, blank()])}
        >
          Add provider
        </Button>
        <label>
          Accept the first
          <select
            value={accept}
            onChange={(e) =>
              setAccept(e.target.value as ProviderWaterfall['accept'])
            }
          >
            <option value="nonempty">Nonempty value</option>
            <option value="email">Email-shaped value (format only)</option>
            <option value="phone">International phone (format only)</option>
            <option value="verified-email">
              Email with verified provider status
            </option>
            <option value="verified-phone">
              Phone with verified provider status
            </option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={continueOnError}
            onChange={(e) => setContinueOnError(e.target.checked)}
          />
          Continue to the next provider after technical errors. Otherwise errors
          stop the chain.
        </label>
        <p>
          Blank or rejected values try the next provider. Each row can make up
          to {steps.length} requests; your run confirmation includes that
          maximum. Verified modes require both a valid format and an explicit
          verification status returned by that provider. Missing, unknown and
          catch-all statuses in the presets fall through. Phone numbers must
          include a country code. A format-only result is not verification. Use
          row tokens such as {'{{domain}}'} in paths and JSON string values.
          Verified phone status does not establish whether a number is a mobile
          number or a company switchboard.
        </p>
        {!loading && neededConnections.length ? (
          <p>
            Needs connection: {neededConnections.join(', ')}. You can save this
            setup now. A missing connection stops that step when run.
          </p>
        ) : null}
        {!loading && (error || validation) ? (
          <p role="alert">{error || validation}</p>
        ) : null}
        <Button
          disabled={
            loading || Boolean(error) || !columns || Boolean(validation)
          }
          onClick={() => {
            if (columns) {
              onAdd(columns);
              changeOpen(false);
            }
          }}
        >
          Add {steps.length === 1 ? 'provider lookup' : 'provider waterfall'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
