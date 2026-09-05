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
  importWebhookEvents,
  saveWebhookMapping,
  validateWebhookMapping,
  type WebhookEvent,
} from '@/lib/webhook-inbox';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
export default function WebhookInbox({
  workspace,
  disabled,
  onImport,
  onSaveMapping,
}: {
  workspace: WorkspaceSnapshot;
  disabled: boolean;
  onSaveMapping: (workspace: WorkspaceSnapshot) => void;
  onImport: (workspace: WorkspaceSnapshot, count: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [sources, setSources] = useState<{ id: string; path: string }[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({
    company: 'company',
    domain: 'domain',
    person: 'person',
    email: 'email',
  });
  async function load(page = 0, source = sourceId) {
    setBusy(true);
    setSelected([]);
    setEvents([]);
    setError('');
    try {
      const response = await fetch(
        `/api/webhooks?workspaceId=${encodeURIComponent(workspace.id)}&offset=${page}&source=${encodeURIComponent(source)}`,
      );
      const data = (await response.json()) as {
        error?: string;
        events: WebhookEvent[];
        sources: { id: string; path: string }[];
        hasMore: boolean;
      };
      if (!response.ok)
        throw new Error(data.error || 'Inbox could not be loaded.');
      setEvents(data.events);
      setSources(data.sources);
      setMore(data.hasMore);
      setOffset(page);
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inbox could not be loaded.');
    } finally {
      setBusy(false);
    }
  }
  const chosen = events.filter((e) => selected.includes(e.id));
  const validMapping = mapping;
  let preview: ReturnType<typeof importWebhookEvents> | undefined;
  let previewError = '';
  let mappingError = '';
  try {
    validateWebhookMapping(workspace, mapping);
  } catch (e) {
    mappingError = e instanceof Error ? e.message : 'Invalid mapping.';
  }
  if (chosen.length)
    try {
      preview = importWebhookEvents(workspace, chosen, validMapping);
    } catch (e) {
      previewError = e instanceof Error ? e.message : 'Invalid mapping.';
    }
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        Webhook inbox
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="template-dialog">
          <DialogHeader>
            <DialogTitle>Webhook inbox</DialogTitle>
            <DialogDescription>
              Receive JSON records from other tools. Select deliveries, map
              their fields and preview new rows before importing. Reimporting a
              delivery skips rows already in this table.
            </DialogDescription>
          </DialogHeader>
          {sources.length ? (
            sources.map((s) => (
              <p key={s.id}>
                <strong>{s.id}</strong> · POST <code>{s.path}</code>
              </p>
            ))
          ) : (
            <p>
              Set POMADE_WEBHOOK_SOURCES in .env.local with this table ID:{' '}
              <code>{workspace.id}</code>, a source name and a random token of
              at least 32 characters. Restart Pomade.
            </p>
          )}
          <p>
            Send Authorization: Bearer YOUR_TOKEN and a stable Idempotency-Key
            header. Body: one JSON object or an array of up to 100 objects.
            Deliveries stay in the inbox; importing does not run paid recipes.
          </p>
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            Refresh latest
          </Button>
          {error ? <p role="alert">{error}</p> : null}
          <div className="webhook-events">
            {events.map((e) => (
              <label key={e.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(e.id)}
                  onChange={(ev) =>
                    setSelected((current) =>
                      ev.target.checked
                        ? [...current, e.id]
                        : current.filter((id) => id !== e.id),
                    )
                  }
                />
                {e.sourceId} · {e.records.length} records ·{' '}
                {new Date(e.receivedAt).toLocaleString()}
                <small>{e.id.slice(0, 12)}</small>
              </label>
            ))}
          </div>
          {!busy && !events.length ? <p>No deliveries yet.</p> : null}
          <div>
            <Button
              variant="outline"
              disabled={busy || offset === 0}
              onClick={() => void load(Math.max(0, offset - 50))}
            >
              Newer
            </Button>{' '}
            <Button
              variant="outline"
              disabled={busy || !more}
              onClick={() => void load(offset + 50)}
            >
              Older
            </Button>
          </div>
          <label>
            Mapping source
            <select
              value={sourceId}
              disabled={busy}
              onChange={(e) => {
                const id = e.target.value;
                setSourceId(id);
                setMapping(
                  workspace.webhookMappings?.[id] ??
                    Object.fromEntries(
                      workspace.columns
                        .filter((c) => c.kind === 'text')
                        .map((c) => [c.id, c.id]),
                    ),
                );
                void load(0, id);
              }}
            >
              <option value="">All sources · ad hoc mapping</option>
              {[
                ...new Set([
                  ...sources.map((s) => s.id),
                  ...events.map((e) => e.sourceId),
                  ...Object.keys(workspace.webhookMappings ?? {}),
                ]),
              ].map((id) => (
                <option key={id} value={id}>
                  {id}
                  {workspace.webhookMappings?.[id] ? ' · saved' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="http-output-grid">
            {workspace.columns
              .filter((c) => c.kind === 'text')
              .map((c) => (
                <label key={c.id}>
                  {c.title}
                  <input
                    placeholder="JSON path, e.g. company.name"
                    value={mapping[c.id] ?? ''}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [c.id]: e.target.value }))
                    }
                  />
                </label>
              ))}
          </div>
          {mappingError ? (
            <p role="alert">
              {mappingError} Remove unavailable fields below or restore their
              columns.
            </p>
          ) : null}
          {Object.keys(mapping)
            .filter(
              (id) =>
                !workspace.columns.some(
                  (c) => c.id === id && c.kind === 'text',
                ),
            )
            .map((id) => (
              <Button
                variant="outline"
                key={id}
                onClick={() =>
                  setMapping((current) =>
                    Object.fromEntries(
                      Object.entries(current).filter(([key]) => key !== id),
                    ),
                  )
                }
              >
                Remove unavailable mapping: {id}
              </Button>
            ))}
          <Button
            variant="outline"
            disabled={disabled || busy || !sourceId || Boolean(mappingError)}
            onClick={() => {
              try {
                onSaveMapping(saveWebhookMapping(workspace, sourceId, mapping));
                setError('Mapping saved to this table.');
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Mapping could not be saved.',
                );
              }
            }}
          >
            Save mapping for source
          </Button>
          {sourceId && workspace.webhookImportErrors?.[sourceId] ? (
            <p role="alert">
              Last automatic import stopped:{' '}
              {workspace.webhookImportErrors[sourceId]}
            </p>
          ) : null}
          {sourceId && workspace.webhookMappings?.[sourceId] ? (
            <label>
              <input
                type="checkbox"
                checked={Boolean(workspace.webhookAutoImport?.[sourceId])}
                disabled={disabled || busy || Boolean(mappingError)}
                onChange={(e) =>
                  onSaveMapping({
                    ...workspace,
                    webhookAutoImport: {
                      ...workspace.webhookAutoImport,
                      [sourceId]: e.target.checked,
                    },
                    updatedAt: Date.now(),
                  })
                }
              />
              Automatically import pending and future deliveries using the saved
              mapping. With the worker clock running, checks about once per
              minute; paid recipes require a separate run.
            </label>
          ) : null}
          {sourceId && workspace.webhookMappings?.[sourceId] ? (
            <Button
              variant="outline"
              disabled={disabled || busy}
              onClick={() => {
                const next = { ...workspace.webhookMappings };
                delete next[sourceId];
                onSaveMapping({
                  ...workspace,
                  webhookMappings: next,
                  webhookAutoImport: {
                    ...workspace.webhookAutoImport,
                    [sourceId]: false,
                  },
                  updatedAt: Date.now(),
                });
                setError('Saved mapping removed.');
              }}
            >
              Forget saved mapping
            </Button>
          ) : null}
          {chosen[0] ? (
            <details>
              <summary>First source record</summary>
              <pre className="http-request-preview">
                {JSON.stringify(chosen[0].records[0], null, 2)}
              </pre>
            </details>
          ) : null}
          {previewError ? <p role="alert">{previewError}</p> : null}
          {preview ? (
            <>
              <output>
                {preview.added} new rows · {preview.skipped} already present
              </output>
              <pre className="http-request-preview">
                {JSON.stringify(
                  preview.workspace.rows
                    .slice(workspace.rows.length, workspace.rows.length + 3)
                    .map((r) => r.values),
                  null,
                  2,
                )}
              </pre>
            </>
          ) : null}
          <Button
            disabled={disabled || busy || !preview?.added}
            onClick={() => {
              if (!preview) return;
              onImport(preview.workspace, preview.added);
              setOpen(false);
            }}
          >
            Import {preview?.added ?? 0} new rows
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
