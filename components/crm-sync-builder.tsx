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
  crmFields,
  type CrmSyncConfig,
  type CrmSyncPlan,
} from '@/lib/crm-sync';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
export default function CrmSyncBuilder({
  workspace,
  rowIds,
  ready,
}: {
  workspace: WorkspaceSnapshot;
  rowIds: string[];
  ready: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [config, setConfig] = useState<CrmSyncConfig>({
    provider: 'hubspot',
    objectType: 'company',
    mapping: {},
  });
  const [plan, setPlan] = useState<CrmSyncPlan>(),
    [history, setHistory] = useState<CrmSyncPlan[]>([]);
  function choose(
    provider: CrmSyncConfig['provider'],
    objectType: CrmSyncConfig['objectType'],
  ) {
    const candidates: Record<string, string> = {
      name: 'company',
      Name: 'company',
      domain: 'domain',
      website: 'domain',
      Website: 'domain',
      description: 'description',
      Description: 'description',
      email: 'email',
      Email: 'email',
      firstname: 'firstname',
      FirstName: 'firstname',
      lastname: 'lastname',
      LastName: 'lastname',
      jobtitle: 'title',
      Title: 'title',
      company: 'company',
      Company: 'company',
      phone: 'phone',
      Phone: 'phone',
      AccountId: 'crm_account_id',
    };
    const mapping = Object.fromEntries(
      crmFields(provider, objectType).flatMap((f) =>
        workspace.columns.some((c) => c.id === candidates[f])
          ? [[f, candidates[f]]]
          : [],
      ),
    );
    setConfig({ provider, objectType, mapping });
    setPlan(undefined);
    setError('');
  }
  async function loadHistory() {
    const r = await fetch(
      '/api/crm-sync?workspaceId=' + encodeURIComponent(workspace.id),
    );
    if (r.ok) setHistory(((await r.json()) as { plans: CrmSyncPlan[] }).plans);
  }
  async function run(commit = false) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/crm-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          commit
            ? { planId: plan?.id, confirmWrite: true }
            : { workspaceId: workspace.id, rowIds, config },
        ),
      });
      const d = (await r.json()) as { plan?: CrmSyncPlan; error?: string };
      if (!r.ok) throw new Error(d.error || 'CRM request failed.');
      setPlan(d.plan);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CRM request failed.');
    } finally {
      setBusy(false);
    }
  }
  const fields = crmFields(config.provider, config.objectType);
  return (
    <>
      <Button
        variant="outline"
        disabled={!ready}
        onClick={() => {
          choose(config.provider, config.objectType);
          setOpen(true);
          void loadHistory().catch(() =>
            setError('Could not load CRM history.'),
          );
        }}
      >
        Write to CRM
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="sources-dialog">
          <DialogHeader>
            <DialogTitle>Write selected rows to CRM</DialogTitle>
            <DialogDescription>
              Preview 1–25 selected rows, or the visible rows when none are
              selected. Blank cells are skipped. Match companies by
              domain/website and people by email. Without email, map first and
              last name plus company website (HubSpot) or AccountId
              (Salesforce). Existing CRM record IDs take priority.
            </DialogDescription>
          </DialogHeader>
          <div className="lookup-fields">
            <label>
              CRM
              <select
                disabled={busy}
                value={config.provider}
                onChange={(e) => {
                  const p = e.target.value as CrmSyncConfig['provider'];
                  choose(p, p === 'hubspot' ? 'company' : 'account');
                }}
              >
                <option value="hubspot">HubSpot</option>
                <option value="salesforce">Salesforce</option>
              </select>
            </label>
            <label>
              Object
              <select
                disabled={busy}
                value={config.objectType}
                onChange={(e) =>
                  choose(
                    config.provider,
                    e.target.value as CrmSyncConfig['objectType'],
                  )
                }
              >
                {(config.provider === 'hubspot'
                  ? ['company', 'contact']
                  : ['account', 'contact', 'lead']
                ).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Existing record ID (optional)
              <select
                disabled={busy}
                value={config.idColumn || ''}
                onChange={(e) => {
                  setConfig({
                    ...config,
                    idColumn: e.target.value || undefined,
                  });
                  setPlan(undefined);
                }}
              >
                <option value="">Match using mapped identity fields</option>
                {workspace.columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="lookup-fields">
            {fields.map((field) => (
              <label key={field}>
                {field}
                <select
                  disabled={busy}
                  value={config.mapping[field] || ''}
                  onChange={(e) => {
                    const mapping = { ...config.mapping };
                    if (e.target.value) mapping[field] = e.target.value;
                    else delete mapping[field];
                    setConfig({ ...config, mapping });
                    setPlan(undefined);
                  }}
                >
                  <option value="">Do not write</option>
                  {workspace.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p>
            {rowIds.length} rows in this selection. Only mapped nonblank fields
            are written. Salesforce contacts need LastName, and leads also need
            Company. Account and company records need a name.
          </p>
          <Button
            disabled={busy || !ready || !rowIds.length || rowIds.length > 25}
            onClick={() => void run()}
          >
            Preview CRM changes
          </Button>
          {error ? <p role="alert">{error}</p> : null}
          {plan ? (
            <section>
              <strong>
                {plan.config.provider} {plan.config.objectType} · Batch:{' '}
                {plan.status}
              </strong>
              {plan.actions.map((a) => (
                <details key={a.rowId}>
                  <summary>
                    {a.label}: {a.action} · {a.status}
                    {a.nativeId ? ' · ' + a.nativeId : ''}
                  </summary>
                  <p>{a.message}</p>
                  <table>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Before</th>
                        <th>After</th>
                        <th>Returned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(a.properties).map(([f, v]) => (
                        <tr key={f}>
                          <td>{f}</td>
                          <td>{a.before[f] || '—'}</td>
                          <td>{v}</td>
                          <td>{a.observed?.[f] || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
              {plan.status === 'preview' ? (
                <Button
                  disabled={
                    busy ||
                    !ready ||
                    workspace.revision !== plan.revision ||
                    plan.actions.some((a) => a.action === 'review')
                  }
                  onClick={() => void run(true)}
                >
                  {busy ? 'Writing…' : 'Confirm CRM write'}
                </Button>
              ) : null}
            </section>
          ) : null}
          {history.length ? (
            <details>
              <summary>Recent CRM batches ({history.length})</summary>
              {history.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  disabled={busy}
                  onClick={() => {
                    setConfig(p.config);
                    setPlan(p);
                    setError('');
                  }}
                >
                  {new Date(p.createdAt).toLocaleString()} · {p.config.provider}{' '}
                  {p.config.objectType} · {p.status}
                </button>
              ))}
            </details>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
