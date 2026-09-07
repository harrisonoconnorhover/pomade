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
  createProspeoMobileColumns,
  PROSPEO_CONNECTION,
  APOLLO_COMPANY_CONNECTION,
  createPdlCompanyColumns,
  PDL_COMPANY_CONNECTION,
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
  const [provider, setProvider] = useState('apollo');
  const [person, setPerson] = useState(
    workspace.columns.some((c) => c.id === 'person') ? 'person' : '',
  );
  const [detailed, setDetailed] = useState(true);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [connectionIds, setConnectionIds] = useState<string[]>([]),
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
      setConnectionIds(d.connections?.map((c) => c.id) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed.');
    } finally {
      setBusy(false);
    }
  }
  let columns: PomadeColumn[] | undefined;
  let issue = '';
  try {
    columns =
      provider === 'mobile'
        ? createProspeoMobileColumns(workspace, person, domain)
        : provider === 'apollo'
          ? createApolloCompanyColumns(workspace, domain, detailed)
          : createPdlCompanyColumns(workspace, domain);
  } catch (e) {
    issue = e instanceof Error ? e.message : 'Choose an input.';
  }
  const configured = connectionIds.includes(
    provider === 'mobile'
      ? PROSPEO_CONNECTION
      : provider === 'apollo'
        ? APOLLO_COMPANY_CONNECTION
        : PDL_COMPANY_CONNECTION,
  );
  return (
    <>
      <Button variant="outline" disabled={!ready} onClick={() => void load()}>
        Provider presets
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="template-dialog">
          <DialogHeader>
            <DialogTitle>Enrichment presets</DialogTitle>
            <DialogDescription>
              Add company details or a verified mobile lookup using your
              connected accounts. Choose input columns and run when ready.
            </DialogDescription>
          </DialogHeader>
          <label>
            Provider
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="mobile">Prospeo · verified mobile</option>
              <option value="apollo">Apollo · company details</option>
              <option value="pdl">People Data Labs</option>
            </select>
          </label>
          {provider === 'apollo' ? (
            <label>
              <input
                type="checkbox"
                checked={detailed}
                onChange={(e) => setDetailed(e.target.checked)}
              />{' '}
              Include revenue, location, funding and technologies
            </label>
          ) : null}
          <p>
            {configured
              ? 'Provider key configured. API access still depends on its scope and your account.'
              : `Set ${provider === 'mobile' ? 'PROSPEO_API_KEY' : provider === 'apollo' ? 'APOLLO_API_KEY' : 'PDL_API_KEY'} in the local server environment and restart to enable this preset. The key stays on the server.`}
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
          {provider === 'mobile' ? (
            <>
              <label>
                Person’s full name
                <select
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                >
                  <option value="">Choose a full-name column</option>
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
                Prospeo returns a mobile number only when it is verified and
                revealed. No-match, masked, or unverified results stay blank. A
                successful mobile lookup uses up to 10 credits; no match is
                free. Previously revealed data may use fewer credits.
              </p>
              <a
                href="https://prospeo.io/api-docs/enrich-person"
                target="_blank"
                rel="noreferrer"
              >
                Prospeo mobile lookup details
              </a>
            </>
          ) : (
            <p>
              Website URLs are normalized to domains. Missing or mismatched
              company details are held for review. This makes one request per
              eligible row; provider credits depend on your plan.
            </p>
          )}
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
            Add{' '}
            {provider === 'mobile'
              ? 'verified mobile'
              : provider === 'apollo'
                ? 'Apollo company'
                : 'PDL company'}{' '}
            columns
          </Button>
          {error ? <output>{error}</output> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
