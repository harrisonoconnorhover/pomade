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
  importApiSource,
  refreshApiSource,
  validateApiSourceRefresh,
  validateApiSource,
  type ApiSourceConfig,
  type ApiSourceBatch,
} from '@/lib/api-source';
import type { HttpConnectionSummary } from '@/lib/http-enrichment';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
const initial: ApiSourceConfig = {
  connectionId: '',
  method: 'GET',
  path: '/companies',
  recordsPath: 'data',
  identityPath: '',
  pagination: 'none',
  parameter: 'page',
  start: 1,
  pageSize: 100,
  sizeParameter: '',
  cursorPath: 'meta.next_cursor',
  maxPages: 3,
  maxRows: 250,
};
export default function ApiSourceBuilder({
  workspace,
  disabled,
  onImport,
  onSave,
}: {
  workspace: WorkspaceSnapshot;
  disabled: boolean;
  onSave: (workspace: WorkspaceSnapshot) => void;
  onImport: (workspace: WorkspaceSnapshot, count: number) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [config, setConfig] = useState<ApiSourceConfig>(
    workspace.apiSourceRefresh?.config ?? initial,
  );
  const [connections, setConnections] = useState<HttpConnectionSummary[]>([]);
  const [history, setHistory] = useState<ApiSourceBatch[]>([]);
  const [batch, setBatch] = useState<ApiSourceBatch>();
  const [error, setError] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>(
    workspace.apiSourceRefresh?.mapping ?? {},
  );
  function change(patch: Partial<ApiSourceConfig>) {
    setConfig((c) => ({ ...c, ...patch }));
    setConfirmed(false);
  }
  async function load() {
    setOpen(true);
    setBusy(true);
    setError('');
    try {
      const [catalog, previous] = await Promise.all([
        fetch('/api/providers/http'),
        fetch(
          `/api/sources/http?workspaceId=${encodeURIComponent(workspace.id)}`,
        ),
      ]);
      const c = (await catalog.json()) as {
        connections: HttpConnectionSummary[];
        error?: string;
      };
      const h = (await previous.json()) as { batches: ApiSourceBatch[] };
      if (!catalog.ok || !previous.ok)
        throw new Error(c.error ?? 'Sources could not be loaded.');
      setConnections(c.connections);
      setHistory(h.batches);
      setConfig((current) => ({
        ...current,
        connectionId: current.connectionId || c.connections[0]?.id || '',
      }));
      setMapping((current) =>
        Object.keys(current).length
          ? current
          : Object.fromEntries(
              workspace.columns
                .filter((c) => c.kind === 'text')
                .map((c) => [c.id, c.id]),
            ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sources could not be loaded.');
    } finally {
      setBusy(false);
    }
  }
  async function fetchRows() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/sources/http', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          config,
          confirmRequests: confirmed,
        }),
      });
      const result = (await response.json()) as {
        batch?: ApiSourceBatch;
        error?: string;
      };
      if (!response.ok || !result.batch)
        throw new Error(result.error ?? 'Fetch failed.');
      setBatch(result.batch);
      setHistory((h) => [result.batch!, ...h].slice(0, 10));
      if (result.error) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed.');
    } finally {
      setBusy(false);
      setConfirmed(false);
    }
  }
  let configError = '';
  try {
    validateApiSource(config);
  } catch (e) {
    configError = e instanceof Error ? e.message : 'Invalid configuration.';
  }
  let preview: ReturnType<typeof importApiSource> | undefined;
  let previewError = '';
  if (batch)
    try {
      preview = importApiSource(workspace, batch, mapping);
    } catch (e) {
      previewError = e instanceof Error ? e.message : 'Invalid mapping.';
    }
  return (
    <>
      <Button variant="outline" disabled={disabled} onClick={() => void load()}>
        Import from API
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="template-dialog">
          <DialogHeader>
            <DialogTitle>Import a list from an API</DialogTitle>
            <DialogDescription>
              Fetch bounded pages, map their JSON fields and preview rows before
              importing. Saved batches remain available if a later page fails.
            </DialogDescription>
          </DialogHeader>
          <label>
            Connection
            <select
              value={config.connectionId}
              disabled={busy}
              onChange={(e) => change({ connectionId: e.target.value })}
            >
              <option value="">Choose a configured connection</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {!connections.length ? (
            <p>
              Configure POMADE_HTTP_CONNECTIONS in .env.local and restart. API
              credentials stay on the server.
            </p>
          ) : null}
          <div className="http-output-grid">
            <label>
              Method
              <select
                value={config.method}
                disabled={busy}
                onChange={(e) =>
                  change({ method: e.target.value as 'GET' | 'POST' })
                }
              >
                {(['GET', 'POST'] as const).map((method) => (
                  <option
                    key={method}
                    disabled={
                      !connections
                        .find((c) => c.id === config.connectionId)
                        ?.methods.includes(method)
                    }
                  >
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Relative path
              <input
                value={config.path}
                disabled={busy}
                onChange={(e) => change({ path: e.target.value })}
              />
            </label>
            <label>
              Records array path
              <input
                value={config.recordsPath}
                disabled={busy}
                onChange={(e) => change({ recordsPath: e.target.value })}
              />
            </label>
            <label>
              Stable record ID path (optional)
              <input
                value={config.identityPath}
                disabled={busy}
                placeholder="id"
                onChange={(e) => change({ identityPath: e.target.value })}
              />
            </label>
          </div>
          {config.method === 'POST' ? (
            <label>
              JSON body
              <textarea
                value={config.body ?? '{}'}
                disabled={busy}
                onChange={(e) => change({ body: e.target.value })}
              />
            </label>
          ) : null}
          <label>
            Pagination
            <select
              value={config.pagination}
              disabled={busy}
              onChange={(e) =>
                change({
                  pagination: e.target.value as ApiSourceConfig['pagination'],
                  start: e.target.value === 'offset' ? 0 : 1,
                })
              }
            >
              <option value="none">Single page</option>
              <option value="page">Page number</option>
              <option value="offset">Record offset</option>
              <option value="cursor">Response cursor</option>
            </select>
          </label>
          {config.pagination !== 'none' ? (
            <div className="http-output-grid">
              <label>
                Query parameter
                <input
                  value={config.parameter}
                  disabled={busy}
                  onChange={(e) => change({ parameter: e.target.value })}
                />
              </label>
              {config.pagination === 'cursor' ? (
                <label>
                  Next cursor response path
                  <input
                    value={config.cursorPath}
                    disabled={busy}
                    onChange={(e) => change({ cursorPath: e.target.value })}
                  />
                </label>
              ) : (
                <label>
                  Starting page / offset
                  <input
                    type="number"
                    min="0"
                    value={config.start}
                    disabled={busy}
                    onChange={(e) => change({ start: Number(e.target.value) })}
                  />
                </label>
              )}
            </div>
          ) : null}
          <div className="http-output-grid">
            <label>
              Page-size parameter (optional)
              <input
                value={config.sizeParameter ?? ''}
                disabled={busy}
                placeholder="limit"
                onChange={(e) => change({ sizeParameter: e.target.value })}
              />
            </label>
            <label>
              Requested page size
              <input
                type="number"
                min="1"
                max="500"
                value={config.pageSize}
                disabled={busy}
                onChange={(e) => change({ pageSize: Number(e.target.value) })}
              />
            </label>
            <label>
              Maximum requests
              <input
                type="number"
                min="1"
                max="10"
                value={config.maxPages}
                disabled={busy}
                onChange={(e) => change({ maxPages: Number(e.target.value) })}
              />
            </label>
            <label>
              Maximum records
              <input
                type="number"
                min="1"
                max="500"
                value={config.maxRows}
                disabled={busy}
                onChange={(e) => change({ maxRows: Number(e.target.value) })}
              />
            </label>
          </div>
          {configError ? <p role="alert">{configError}</p> : null}
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Allow up to {config.pagination === 'none' ? 1 : config.maxPages}{' '}
            requests to this connection. Cost and remote effects depend on its
            API; requests are not automatically retried.
          </label>
          <Button
            disabled={
              busy ||
              disabled ||
              !confirmed ||
              Boolean(configError) ||
              !config.connectionId
            }
            onClick={() => void fetchRows()}
          >
            {busy ? 'Working…' : 'Fetch records'}
          </Button>
          {error ? <p role="alert">{error}</p> : null}
          {history.length ? (
            <label>
              Saved fetch
              <select
                value={batch?.id ?? ''}
                disabled={busy}
                onChange={(e) => {
                  const b = history.find((b) => b.id === e.target.value);
                  setBatch(b);
                  if (b) {
                    setConfig(b.config);
                    setConfirmed(false);
                  }
                }}
              >
                <option value="">Choose a saved batch</option>
                {history.map((b) => (
                  <option key={b.id} value={b.id}>
                    {new Date(b.createdAt).toLocaleString()} ·{' '}
                    {b.records.length} records · {b.status}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {batch ? (
            <>
              <output>
                {batch.requests} requests · {batch.pages} pages ·{' '}
                {batch.records.length} records · {batch.status}: {batch.reason}
              </output>
              <details>
                <summary>First source record</summary>
                <pre className="http-request-preview">
                  {JSON.stringify(batch.records[0]?.value, null, 2)}
                </pre>
              </details>
              <div className="http-output-grid">
                {workspace.columns
                  .filter((c) => c.kind === 'text')
                  .map((c) => (
                    <label key={c.id}>
                      {c.title}
                      <input
                        value={mapping[c.id] ?? ''}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [c.id]: e.target.value }))
                        }
                      />
                    </label>
                  ))}
              </div>
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
                  if (preview) {
                    onImport(preview.workspace, preview.added);
                    setOpen(false);
                  }
                }}
              >
                Import {preview?.added ?? 0} new rows
              </Button>
              <Button
                variant="outline"
                disabled={
                  disabled ||
                  busy ||
                  batch.status !== 'complete' ||
                  !batch.config.identityPath ||
                  Boolean(previewError)
                }
                onClick={() => {
                  try {
                    const refresh = {
                      config: structuredClone(batch.config),
                      mapping: { ...mapping },
                    };
                    validateApiSourceRefresh(workspace, refresh);
                    const checked = refreshApiSource(workspace, batch, mapping);
                    onSave({
                      ...workspace,
                      apiSourceRefresh: refresh,
                      updatedAt: Date.now(),
                    });
                    setError(
                      `Refresh configuration saved: ${checked.added} new and ${checked.updated} changed records in this batch. Enable it in Schedule recipe runs.`,
                    );
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : 'Refresh could not be saved.',
                    );
                  }
                }}
              >
                Save this batch configuration for scheduled refresh
              </Button>
              <p>
                Scheduled refresh requires a complete fetch and stable IDs. It
                adds new rows and overwrites mapped input fields, including
                blanks, for existing IDs. Other fields and absent records
                remain. Saving here makes no requests and does not enable a
                schedule.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(batch, null, 2)], {
                      type: 'application/json',
                    }),
                  );
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `pomade-api-${batch.id}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download batch
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
