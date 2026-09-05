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
  emailProviderStep,
  HUNTER_CONNECTION,
  APOLLO_PEOPLE_CONNECTION,
} from '@/lib/provider-presets';
import type { HttpConnectionSummary } from '@/lib/http-enrichment';
import type {
  PomadeColumn,
  WorkspaceSnapshot,
  HttpProviderStep,
  ProviderWaterfall,
} from '@/lib/pomade-types';
const blank = (): HttpProviderStep => ({
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
  const [connections, setConnections] = useState<HttpConnectionSummary[]>([]);
  const [title, setTitle] = useState('Provider result');
  const [steps, setSteps] = useState<HttpProviderStep[]>([blank(), blank()]);
  const [accept, setAccept] = useState<ProviderWaterfall['accept']>('nonempty');
  const [continueOnError, setContinueOnError] = useState(false);
  const [error, setError] = useState('');
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
        if (!cancelled) setConnections(data.connections);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);
  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  let columns: PomadeColumn[] | undefined;
  let validation = '';
  try {
    columns = createProviderWaterfall(workspace, {
      id,
      title,
      steps,
      accept,
      continueOnError,
    });
    if (
      steps.some(
        (step) =>
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
      current.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="template-dialog">
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
        {!connections.length ? (
          <p>
            Configure HTTP provider connections in .env.local first. Each
            provider keeps its own server-side credentials.
          </p>
        ) : null}
        {steps.map((step, index) => (
          <fieldset key={index}>
            <legend>Attempt {index + 1}</legend>
            <label>
              Quick setup
              <select
                aria-label={`Provider preset ${index + 1}`}
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    edit(
                      index,
                      emailProviderStep(e.target.value as 'hunter' | 'apollo'),
                    );
                    setAccept('verified-email');
                  }
                }}
              >
                <option value="">Custom request or choose a preset</option>
                <option
                  value="hunter"
                  disabled={
                    !connections.some((c) => c.id === HUNTER_CONNECTION)
                  }
                >
                  Hunter verified email
                </option>
                <option
                  value="apollo"
                  disabled={
                    !connections.some((c) => c.id === APOLLO_PEOPLE_CONNECTION)
                  }
                >
                  Apollo verified email
                </option>
              </select>
            </label>
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
                          acceptedValues: step.verification?.acceptedValues ?? [
                            'valid',
                          ],
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
              disabled={steps.length <= 2}
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
          Presets use the person and domain columns; change the tokens for other
          inputs.
        </p>
        {error || validation ? <p role="alert">{error || validation}</p> : null}
        <Button
          disabled={!columns || Boolean(validation)}
          onClick={() => {
            if (columns) {
              onAdd(columns);
              onOpenChange(false);
            }
          }}
        >
          Add provider waterfall
        </Button>
      </DialogContent>
    </Dialog>
  );
}
