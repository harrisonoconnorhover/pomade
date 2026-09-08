'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Search, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { CrmField } from '@/lib/crm-fields';
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
import {
  copyVerifiedCrmIds,
  saveCrmMapping,
  removeCrmMapping,
  sameCrmConfig,
  type CrmMapping,
} from '@/lib/crm-mappings';
export default function CrmSyncBuilder({
  workspace,
  rowIds,
  ready,
  onSave,
}: {
  workspace: WorkspaceSnapshot;
  rowIds: string[];
  ready: boolean;
  onSave: (workspace: WorkspaceSnapshot) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [fieldResult, setFieldResult] = useState<{
    key: string;
    fields: CrmField[];
    error: string;
  }>({ key: '', fields: [], error: '' });
  const [mappingId, setMappingId] = useState('');
  const [propertyQuery, setPropertyQuery] = useState('');
  const [fieldRevision, setFieldRevision] = useState(0);
  const [mappingName, setMappingName] = useState('');
  const [notice, setNotice] = useState('');
  const [copyIssues, setCopyIssues] = useState<string[]>([]);
  function loadMapping(mapping: CrmMapping) {
    setMappingId(mapping.id);
    setMappingName(mapping.name);
    setConfig(structuredClone(mapping.config));
    setPlan(undefined);
    setError('');
    setNotice('');
    setCopyIssues([]);
  }
  function saveMapping() {
    try {
      const id = mappingId || crypto.randomUUID();
      onSave(saveCrmMapping(workspace, { id, name: mappingName, config }));
      setMappingId(id);
      setMappingName(mappingName.replace(/\s+/g, ' ').trim());
      setPlan(undefined);
      setError('');
      setNotice(
        'Mapping updated. Preview again when the table finishes saving.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mapping could not be saved.');
    }
  }
  function copyIds() {
    if (!plan) return;
    try {
      const result = copyVerifiedCrmIds(workspace, plan);
      if (result.copied) {
        onSave(result.workspace);
        setConfig({ ...plan.config, idColumn: result.idColumn });
      }
      setCopyIssues(result.issues);
      setError('');
      setNotice(
        `${result.copied} verified CRM IDs copied to the table. ${result.issues.length} rows not copied.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CRM IDs could not be copied.');
    }
  }
  const [config, setConfig] = useState<CrmSyncConfig>({
    provider: 'hubspot',
    objectType: 'company',
    mapping: {},
  });
  const fieldKey = `${config.provider}/${config.objectType}/${fieldRevision}`;
  const fieldsLoading = fieldResult.key !== fieldKey;
  const nativeFields = fieldsLoading ? [] : fieldResult.fields;
  const fieldsError = fieldsLoading ? '' : fieldResult.error;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(
      `/api/crm-sync/fields?provider=${config.provider}&objectType=${config.objectType}`,
    )
      .then(async (r) => {
        const data = (await r.json()) as {
          fields?: CrmField[];
          error?: string;
        };
        if (!r.ok) throw new Error(data.error || 'Fields could not be loaded.');
        if (!cancelled)
          setFieldResult({
            key: fieldKey,
            fields: data.fields ?? [],
            error: '',
          });
      })
      .catch((e) => {
        if (!cancelled)
          setFieldResult({ key: fieldKey, fields: [], error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, config.provider, config.objectType, fieldKey]);
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
    setMappingId('');
    setPropertyQuery('');
    setMappingName(
      `${provider === 'hubspot' ? 'HubSpot' : 'Salesforce'} ${objectType}`,
    );
    setNotice('');
    setCopyIssues([]);
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
    setNotice('');
    setCopyIssues([]);
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
  const fields = [
    ...new Set([
      ...crmFields(config.provider, config.objectType),
      ...Object.keys(config.mapping),
      ...Object.keys(config.fieldSchema ?? {}),
    ]),
  ];
  const availableFields = nativeFields
    .filter(
      (field) =>
        !fields.includes(field.name) &&
        `${field.label} ${field.name}`
          .toLowerCase()
          .includes(propertyQuery.trim().toLowerCase()),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
  const rowNames = workspace.rows
    .filter((row) => rowIds.includes(row.id))
    .slice(0, 3)
    .map((row) => row.values.company || row.values.person || 'Unnamed record');
  const mappedCount = Object.values(config.mapping).filter(Boolean).length;
  return (
    <>
      <Button
        variant="outline"
        disabled={!ready}
        onClick={() => {
          const saved =
            workspace.crmMappings?.find((m) => m.id === mappingId) ||
            workspace.crmMappings?.[0];
          if (saved) loadMapping(saved);
          else choose(config.provider, config.objectType);
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
        <DialogContent className="sources-dialog crm-sync-dialog">
          <DialogHeader>
            <DialogTitle>Write selected rows to CRM</DialogTitle>
            <DialogDescription>
              Choose a destination, match your columns to CRM fields, then
              review the exact changes. Blank cells are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="crm-sync-scope">
            <span>
              <strong>{rowIds.length}</strong>{' '}
              {rowIds.length === 1 ? 'record' : 'records'} in scope
            </span>
            <span>
              <strong>{mappedCount}</strong> mapped fields
            </span>
            <p>
              {rowNames.join(' · ')}
              {rowIds.length > 3 ? ` · +${rowIds.length - 3} more` : ''}
            </p>
          </div>
          {rowIds.length > 25 ? (
            <p role="alert" className="crm-sync-warning">
              Select 25 rows or fewer in the sheet before previewing CRM
              changes.
            </p>
          ) : null}
          <label className="crm-saved-mapping">
            Saved mapping
            <select
              value={mappingId}
              disabled={busy || !ready}
              onChange={(e) => {
                const saved = workspace.crmMappings?.find(
                  (m) => m.id === e.target.value,
                );
                if (saved) loadMapping(saved);
                else choose(config.provider, config.objectType);
              }}
            >
              <option value="">New mapping</option>
              {workspace.crmMappings?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <div className="lookup-fields">
            <label>
              CRM
              <select
                aria-label="CRM"
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
                aria-label="Object"
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
          <section
            className="crm-add-property"
            aria-label="Find CRM properties"
          >
            <div className="crm-mapping-heading">
              <strong>Map your fields</strong>
              <small>
                Pomade column <ArrowRight size={12} /> CRM property
              </small>
            </div>
            <label className="crm-property-search">
              <Search size={16} />
              <input
                aria-label="Search CRM properties"
                placeholder="Find a property, score, tag, or owner…"
                value={propertyQuery}
                onChange={(event) => setPropertyQuery(event.target.value)}
              />
            </label>
            <label className="crm-property-select">
              Add a CRM property or custom field
              <select
                aria-label="Add a CRM property or custom field"
                disabled={fieldsLoading || busy}
                value=""
                onChange={(event) => {
                  const field = nativeFields.find(
                    (item) => item.name === event.target.value,
                  );
                  if (field) {
                    setConfig({
                      ...config,
                      fieldSchema: {
                        ...config.fieldSchema,
                        [field.name]: field,
                      },
                    });
                    setPlan(undefined);
                    setPropertyQuery('');
                  }
                }}
              >
                <option value="">
                  {fieldsLoading
                    ? 'Loading CRM fields…'
                    : availableFields.length
                      ? `${availableFields.length} properties available`
                      : propertyQuery
                        ? 'No properties match this search'
                        : 'All available properties are already listed'}
                </option>
                {availableFields.map((field) => (
                  <option key={field.name} value={field.name}>
                    {field.label} ({field.name}) · {field.type}
                  </option>
                ))}
              </select>
            </label>
            {fieldsError ? (
              <div className="crm-field-error">
                <p role="alert">{fieldsError}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFieldRevision((value) => value + 1)}
                >
                  <RefreshCw />
                  Retry fields
                </Button>
              </div>
            ) : null}
          </section>
          <div className="crm-field-mappings">
            {fields.map((field) => (
              <label key={field}>
                <span>
                  <strong>
                    {(
                      nativeFields.find((item) => item.name === field) ??
                      config.fieldSchema?.[field]
                    )?.label ?? field}
                  </strong>
                  <small>
                    {field}
                    {config.fieldSchema?.[field]
                      ? ` · ${config.fieldSchema[field].type}`
                      : ''}
                  </small>
                </span>
                <select
                  aria-label={`Map ${field}`}
                  disabled={busy}
                  value={config.mapping[field] || ''}
                  onChange={(e) => {
                    const mapping = { ...config.mapping };
                    if (e.target.value) mapping[field] = e.target.value;
                    else delete mapping[field];
                    const schema = { ...config.fieldSchema };
                    const metadata = nativeFields.find((f) => f.name === field);
                    if (metadata) schema[field] = metadata;
                    setConfig({
                      ...config,
                      mapping,
                      ...(Object.keys(schema).length
                        ? { fieldSchema: schema }
                        : {}),
                    });
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
                {config.fieldSchema?.[field]?.options ? (
                  <small>
                    Values:{' '}
                    {config.fieldSchema[field]
                      .options!.map((o) => o.value)
                      .join(', ')}
                    {config.fieldSchema[field].type === 'multiselect'
                      ? '. Separate multiple values with semicolons.'
                      : ''}
                  </small>
                ) : null}
              </label>
            ))}
          </div>
          <details className="crm-save-mapping">
            <summary>Save these field choices for reuse</summary>
            <div className="lookup-fields">
              <label>
                Mapping name
                <input
                  value={mappingName}
                  maxLength={80}
                  disabled={busy || !ready}
                  onChange={(e) => setMappingName(e.target.value)}
                  placeholder="e.g. HubSpot account research"
                />
              </label>
              <Button disabled={busy || !ready} onClick={saveMapping}>
                {mappingId ? 'Save mapping changes' : 'Save mapping'}
              </Button>
              {mappingId ? (
                <Button
                  variant="outline"
                  disabled={busy || !ready}
                  onClick={() => {
                    onSave(removeCrmMapping(workspace, mappingId));
                    setMappingId('');
                    setPlan(undefined);
                    setError('');
                    setNotice(
                      'Saved mapping removed. Table values and CRM records are unchanged.',
                    );
                  }}
                >
                  Remove saved mapping
                </Button>
              ) : null}
            </div>
          </details>
          <p>
            Companies match by domain or website; people match by email.
            Existing CRM IDs take priority. Salesforce contacts need LastName;
            leads also need Company. Name-only matching requires company website
            (HubSpot) or AccountId (Salesforce).
          </p>
          <Button
            disabled={busy || !ready || !rowIds.length || rowIds.length > 25}
            onClick={() => void run()}
          >
            Preview CRM changes
          </Button>
          {error ? <p role="alert">{error}</p> : null}
          {notice ? <output>{notice}</output> : null}
          {copyIssues.length ? (
            <details open>
              <summary>Rows not copied ({copyIssues.length})</summary>
              <ul>
                {copyIssues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {plan ? (
            <section
              className="crm-plan-review"
              aria-label="CRM changes to review"
            >
              <div className="crm-plan-heading">
                <strong>
                  {plan.status === 'complete' ? (
                    <>
                      <CheckCircle2 size={18} />
                      CRM changes verified
                    </>
                  ) : (
                    'Review these changes'
                  )}
                </strong>
                <span>
                  {plan.config.provider === 'hubspot'
                    ? 'HubSpot'
                    : 'Salesforce'}{' '}
                  · {plan.config.objectType}
                </span>
              </div>
              <div className="crm-plan-counts">
                {(['create', 'update', 'unchanged', 'review'] as const).map(
                  (action) => (
                    <span key={action} data-action={action}>
                      <strong>
                        {
                          plan.actions.filter((item) => item.action === action)
                            .length
                        }
                      </strong>
                      {action === 'create'
                        ? plan.status === 'complete'
                          ? 'created'
                          : 'to create'
                        : action === 'update'
                          ? plan.status === 'complete'
                            ? 'updated'
                            : 'to update'
                          : action === 'review'
                            ? 'need review'
                            : 'unchanged'}
                    </span>
                  ),
                )}
              </div>
              {plan.status === 'preview' &&
              workspace.revision !== plan.revision ? (
                <p role="alert" className="crm-sync-warning">
                  This sheet changed after preview. Preview CRM changes again
                  before writing.
                </p>
              ) : null}
              {plan.actions.map((a) => (
                <details
                  key={a.rowId}
                  className="crm-change-record"
                  open={plan.actions.length === 1 || a.action === 'review'}
                >
                  <summary>
                    <strong>{a.label}</strong>
                    <span data-status={a.status}>
                      {a.action === 'create'
                        ? a.status === 'verified'
                          ? 'Created'
                          : 'Create new'
                        : a.action === 'update'
                          ? a.status === 'verified'
                            ? 'Updated'
                            : 'Update existing'
                          : a.action === 'review'
                            ? 'Needs review'
                            : 'No change'}{' '}
                      · {a.status}
                    </span>
                  </summary>
                  {a.message ? <p>{a.message}</p> : null}
                  {a.nativeId ? (
                    <small className="crm-record-id">
                      CRM record ID: {a.nativeId}
                    </small>
                  ) : null}
                  <div className="crm-change-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Field</th>
                          {a.action !== 'create' ? <th>Before</th> : null}
                          <th>New value</th>
                          {a.observed ? <th>Verified value</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(a.properties).map(([f, v]) => (
                          <tr key={f}>
                            <td>{plan.config.fieldSchema?.[f]?.label ?? f}</td>
                            {a.action !== 'create' ? (
                              <td>{a.before[f] || '—'}</td>
                            ) : null}
                            <td>{v}</td>
                            {a.observed ? (
                              <td>{a.observed[f] || '—'}</td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
              {plan.actions.some(
                (a) => a.status === 'verified' && a.nativeId,
              ) ? (
                <Button
                  variant="outline"
                  disabled={busy || !ready}
                  onClick={copyIds}
                >
                  Copy verified IDs to table
                </Button>
              ) : null}
              {plan.status === 'preview' ? (
                <Button
                  className="crm-confirm-write"
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
                    const saved = workspace.crmMappings?.find((m) =>
                      sameCrmConfig(m.config, p.config),
                    );
                    setMappingId(saved?.id || '');
                    setMappingName(
                      saved?.name ||
                        `${p.config.provider} ${p.config.objectType}`,
                    );
                    setConfig(p.config);
                    setPlan(p);
                    setError('');
                    setNotice('');
                    setCopyIssues([]);
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
