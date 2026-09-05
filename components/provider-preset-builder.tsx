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
  createApolloCompanyColumns,
  APOLLO_COMPANY_CONNECTION,
} from '@/lib/provider-presets';
import type { PomadeColumn, WorkspaceSnapshot } from '@/lib/pomade-types';
export default function ProviderPresetBuilder({
  workspace,
  ready,
  onAdd,
}: {
  workspace: WorkspaceSnapshot;
  ready: boolean;
  onAdd: (columns: PomadeColumn[]) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [configured, setConfigured] = useState(false),
    [error, setError] = useState('');
  const [domain, setDomain] = useState(
    workspace.columns.some((c) => c.id === 'domain') ? 'domain' : '',
  );
  async function load() {
    setOpen(true);
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/providers/http');
      const d = (await r.json()) as {
        connections?: { id: string }[];
        error?: string;
      };
      if (!r.ok) throw new Error(d.error ?? 'Connections could not be loaded.');
      setConfigured(
        Boolean(d.connections?.some((c) => c.id === APOLLO_COMPANY_CONNECTION)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed.');
    } finally {
      setBusy(false);
    }
  }
  let columns: PomadeColumn[] | undefined;
  let issue = '';
  try {
    columns = createApolloCompanyColumns(workspace, domain);
  } catch (e) {
    issue = e instanceof Error ? e.message : 'Choose an input.';
  }
  return (
    <>
      <Button variant="outline" disabled={!ready} onClick={() => void load()}>
        Provider presets
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="template-dialog">
          <DialogHeader>
            <DialogTitle>Apollo company enrichment</DialogTitle>
            <DialogDescription>
              Enrich company name, domain, industry and employee estimate from a
              domain. Uses your existing Apollo key and ordinary
              run/queue/schedule request controls. Adding columns makes no
              provider requests.
            </DialogDescription>
          </DialogHeader>
          <p>
            {configured
              ? 'Apollo key configured. API access still depends on its scope and your account.'
              : 'Set APOLLO_API_KEY in the local server environment and restart to enable this preset. The key stays on the server.'}
          </p>
          <label>
            Domain input
            <select value={domain} onChange={(e) => setDomain(e.target.value)}>
              <option value="">Choose a domain field</option>
              {workspace.columns
                .filter((c) => c.kind !== 'status')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </select>
          </label>
          <p>
            Website URLs are normalized to domains. A missing or mismatched
            response domain is withheld for review. Missing enrichment fields
            remain blank and flagged.
          </p>
          <p>
            Apollo currently lists one credit per organization. This preset
            makes one request per eligible row; actual credits are not inferred
            from a successful response.{' '}
            <a
              href="https://docs.apollo.io/reference/organization-enrichment"
              target="_blank"
              rel="noreferrer"
            >
              Apollo endpoint and pricing details
            </a>
          </p>
          {issue ? (
            <p role="alert">{issue}</p>
          ) : (
            <p>Adds {columns?.map((c) => c.title).join(', ')}.</p>
          )}
          <Button
            disabled={!ready || busy || !configured || !columns}
            onClick={() => {
              if (columns) {
                onAdd(columns);
                setOpen(false);
              }
            }}
          >
            Add Apollo company columns
          </Button>
          {error ? <output>{error}</output> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
