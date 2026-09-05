'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  createHttpColumns,
  prepareHttpRequest,
  type HttpConnectionSummary,
} from '@/lib/http-enrichment';
import type { PomadeColumn, WorkspaceSnapshot } from '@/lib/pomade-types';

export default function HttpRecipeBuilder({
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
  const [connectionId, setConnectionId] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [path, setPath] = useState('/enrich?domain={{domain}}');
  const [body, setBody] = useState('{"domain":"{{domain}}"}');
  const [outputs, setOutputs] = useState([
    { title: 'API result', path: 'data.name' },
  ]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/providers/http')
      .then(async (response) => {
        const result = (await response.json()) as {
          connections?: HttpConnectionSummary[];
          error?: string;
        };
        if (!response.ok || !result.connections)
          throw new Error(result.error ?? 'Connections could not be loaded.');
        if (cancelled) return;
        setConnections(result.connections);
        setConnectionId((current) =>
          result.connections!.some((c) => c.id === current)
            ? current
            : (result.connections![0]?.id ?? ''),
        );
        setError('');
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);
  const connection = connections.find((c) => c.id === connectionId);
  const preview = useMemo(() => {
    if (!connection) return undefined;
    try {
      let id = 'http_preview';
      while (workspace.columns.some((c) => c.id.startsWith(id))) id += '_';
      const columns = createHttpColumns(workspace, {
        id,
        title: outputs[0]?.title ?? '',
        connectionId,
        method,
        pathTemplate: path,
        bodyTemplate: body,
        outputs,
      });
      if (!connection.methods.includes(method))
        throw new Error('Choose a method enabled for this connection.');
      const row = workspace.rows[0];
      if (!row)
        return { columns, message: 'Add a row to preview its request.' };
      try {
        return {
          columns,
          request: prepareHttpRequest(columns[0], row, {
            ...connection,
            headers: {},
          }),
        };
      } catch (e) {
        return {
          columns,
          message:
            e instanceof Error
              ? e.message
              : 'This row is missing request inputs.',
        };
      }
    } catch (e) {
      return {
        error:
          e instanceof Error ? e.message : 'Check the request configuration.',
      };
    }
  }, [connection, connectionId, workspace, outputs, path, body, method]);
  function add() {
    try {
      onAdd(
        createHttpColumns(workspace, {
          id: `http_${crypto.randomUUID().replaceAll('-', '')}`,
          title: outputs[0]?.title ?? '',
          connectionId,
          method,
          pathTemplate: path,
          bodyTemplate: body,
          outputs,
        }),
      );
      onOpenChange(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'The request could not be added.',
      );
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lookup-builder">
        <DialogHeader>
          <DialogTitle>HTTP API enrichment</DialogTitle>
          <DialogDescription>
            Send row values to a configured API and return selected JSON fields.
            Headers and credentials stay on the server.
          </DialogDescription>
        </DialogHeader>
        <div className="lookup-fields">
          <label>
            Connection
            <select
              value={connectionId}
              onChange={(event) => setConnectionId(event.target.value)}
            >
              {!connections.length ? (
                <option value="">No connections configured</option>
              ) : null}
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} · {c.origin}
                </option>
              ))}
            </select>
          </label>
          <label>
            Method
            <select
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as 'GET' | 'POST')
              }
            >
              <option
                value="GET"
                disabled={!connection?.methods.includes('GET')}
              >
                GET
              </option>
              <option
                value="POST"
                disabled={!connection?.methods.includes('POST')}
              >
                POST (JSON)
              </option>
            </select>
          </label>
        </div>
        <label className="workbook-name">
          API path and query
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/enrich?domain={{domain}}"
          />
        </label>
        <p className="lookup-note">
          Column tokens:{' '}
          {workspace.columns
            .filter((c) => c.kind !== 'status')
            .map((c) => `{{${c.id}}}`)
            .join(' · ')}
        </p>
        {method === 'POST' ? (
          <label className="workbook-name">
            JSON body
            <textarea
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
        ) : null}
        <fieldset className="http-output-fields">
          <legend>
            Response fields · dot paths, including array positions such as
            data.0.name
          </legend>
          {outputs.map((output, index) => (
            <div className="lookup-fields" key={index}>
              <label>
                Column name
                <input
                  value={output.title}
                  onChange={(event) =>
                    setOutputs((current) =>
                      current.map((field, i) =>
                        i === index
                          ? { ...field, title: event.target.value }
                          : field,
                      ),
                    )
                  }
                />
              </label>
              <label>
                JSON field path
                <input
                  value={output.path}
                  onChange={(event) =>
                    setOutputs((current) =>
                      current.map((field, i) =>
                        i === index
                          ? { ...field, path: event.target.value }
                          : field,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
          <Button
            variant="outline"
            disabled={outputs.length === 4}
            onClick={() =>
              setOutputs((current) => [
                ...current,
                { title: 'Additional field', path: '' },
              ])
            }
          >
            Add response field
          </Button>
          {outputs.length > 1 ? (
            <Button
              variant="outline"
              onClick={() => setOutputs((current) => current.slice(0, -1))}
            >
              Remove last field
            </Button>
          ) : null}
        </fieldset>
        {preview && 'columns' in preview ? (
          <div className="http-request-preview">
            <strong>Request preview · first row · no request sent</strong>
            {'request' in preview && preview.request ? (
              <pre>
                {method} {preview.request.url}
                {preview.request.init.body
                  ? `\n${preview.request.init.body}`
                  : ''}
              </pre>
            ) : (
              <p>{preview.message}</p>
            )}
          </div>
        ) : null}
        {!connections.length ? (
          <p className="lookup-note">
            Add POMADE_HTTP_CONNECTIONS in local configuration, then restart
            Pomade. See the README for the connection format.
          </p>
        ) : null}
        {error || (preview && 'error' in preview) ? (
          <p className="template-error">{error || preview?.error}</p>
        ) : null}
        <p className="lookup-note">
          Use enrichment endpoints you intend to call. Requests may incur
          charges or change remote data depending on the endpoint. Runs ask for
          confirmation. Requests are not automatically retried.
        </p>
        <Button onClick={add} disabled={!preview || 'error' in preview}>
          Add HTTP recipe
        </Button>
      </DialogContent>
    </Dialog>
  );
}
