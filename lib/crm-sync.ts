import type {
  CrmObjectType,
  CrmProvider,
  WorkspaceSnapshot,
} from './pomade-types';
import type { CrmSourceOptions } from './crm-sources';

export type CrmSyncConfig = {
  provider: CrmProvider;
  objectType: CrmObjectType;
  mapping: Record<string, string>;
  idColumn?: string;
};
export type CrmSyncAction = {
  rowId: string;
  label: string;
  properties: Record<string, string>;
  before: Record<string, string>;
  observed?: Record<string, string>;
  nativeId?: string;
  action: 'create' | 'update' | 'unchanged' | 'review';
  status: 'pending' | 'verified' | 'failed' | 'uncertain';
  message?: string;
};
export type CrmSyncPlan = {
  id: string;
  workspaceId: string;
  revision: number;
  config: CrmSyncConfig;
  actions: CrmSyncAction[];
  createdAt: number;
  status: 'preview' | 'running' | 'complete' | 'review';
};

export function crmFields(
  provider: CrmProvider,
  objectType: CrmObjectType,
): string[] {
  if (provider === 'hubspot') {
    if (objectType === 'company')
      return ['name', 'domain', 'website', 'description', 'phone'];
    if (objectType === 'contact')
      return [
        'firstname',
        'lastname',
        'email',
        'company',
        'website',
        'jobtitle',
        'phone',
      ];
  } else if (provider === 'salesforce') {
    if (objectType === 'account')
      return ['Name', 'Website', 'Description', 'Phone'];
    if (objectType === 'contact')
      return ['FirstName', 'LastName', 'Email', 'Title', 'Phone', 'AccountId'];
    if (objectType === 'lead')
      return [
        'FirstName',
        'LastName',
        'Email',
        'Company',
        'Title',
        'Phone',
        'Website',
      ];
  }
  throw new Error('Unsupported CRM object.');
}
const objectName = (config: CrmSyncConfig) =>
  config.provider === 'hubspot'
    ? config.objectType === 'company'
      ? 'companies'
      : 'contacts'
    : config.objectType === 'account'
      ? 'Account'
      : config.objectType === 'lead'
        ? 'Lead'
        : 'Contact';
const asText = (v: unknown) =>
  typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : '';
function origin(options: CrmSourceOptions) {
  const url = new URL(options.salesforceInstanceUrl || '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !/\.(salesforce\.com|force\.com)$/.test(url.hostname)
  )
    throw new Error('Invalid Salesforce instance URL.');
  return url.origin;
}
function version(options: CrmSourceOptions) {
  const v = options.salesforceApiVersion || '67.0';
  if (!/^\d{2}\.\d$/.test(v))
    throw new Error('Invalid Salesforce API version.');
  return v;
}
const quote = (v: string) =>
  "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
function websiteVariants(value: string) {
  const url = new URL(value.includes('://') ? value : 'https://' + value);
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.replace(/\/$/, '') + url.search;
  return [
    ...new Set([
      value,
      ...['', 'http://', 'https://'].flatMap((scheme) =>
        [host, 'www.' + host].flatMap((h) => [
          scheme + h + path,
          scheme + h + path + '/',
        ]),
      ),
    ]),
  ];
}
function comparable(field: string, value: string) {
  if (value && ['website', 'Website', 'domain'].includes(field)) {
    try {
      const url = new URL(value.includes('://') ? value : 'https://' + value);
      return (
        url.hostname.toLowerCase().replace(/^www\./, '') +
        url.pathname.replace(/\/$/, '') +
        url.search
      );
    } catch {
      return value;
    }
  }
  return ['email', 'Email'].includes(field) ? value.toLowerCase() : value;
}
export class CrmSyncClient {
  constructor(
    readonly config: CrmSyncConfig,
    readonly options: CrmSourceOptions,
  ) {
    crmFields(config.provider, config.objectType);
  }
  get base() {
    return this.config.provider === 'hubspot'
      ? 'https://api.hubapi.com/crm/v3'
      : `${origin(this.options)}/services/data/v${version(this.options)}`;
  }
  get path() {
    return this.config.provider === 'hubspot'
      ? `/objects/${objectName(this.config)}`
      : `/sobjects/${objectName(this.config)}`;
  }
  async request(path: string, method = 'GET', body?: unknown) {
    const token =
      this.config.provider === 'hubspot'
        ? this.options.hubSpotAccessToken
        : this.options.salesforceAccessToken;
    if (!token) throw new Error('CRM connection is not configured.');
    const r = await (this.options.fetchImpl || fetch)(this.base + path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    if (!r.ok) {
      const e = new Error(
        `CRM request failed (HTTP ${r.status}). ${asText(
          data.message || data[0]?.message,
        )
          .replaceAll(token, '[redacted]')
          .slice(0, 220)}`,
      );
      Object.assign(e, { httpStatus: r.status });
      throw e;
    }
    return data;
  }
  async read(id: string, fields: string[]) {
    if (!/^[a-zA-Z0-9]{1,30}$/.test(id))
      throw new Error('Invalid CRM record ID.');
    const query =
      this.config.provider === 'hubspot'
        ? '?properties=' + encodeURIComponent(fields.join(','))
        : '?fields=' + encodeURIComponent(fields.join(','));
    const d = await this.request(this.path + '/' + id + query);
    const raw = this.config.provider === 'hubspot' ? d.properties : d;
    return Object.fromEntries(fields.map((f) => [f, asText(raw?.[f])]));
  }
  async find(properties: Record<string, string>): Promise<string | undefined> {
    const company =
      this.config.objectType === 'company' ||
      this.config.objectType === 'account';
    const key =
      this.config.provider === 'hubspot'
        ? company
          ? 'domain'
          : 'email'
        : company
          ? 'Website'
          : 'Email';
    const value = properties[key];
    if (!value) {
      if (company)
        throw new Error(
          `Map ${key} or an existing CRM record ID to match records safely.`,
        );
      const first = properties.firstname || properties.FirstName;
      const last = properties.lastname || properties.LastName;
      const context =
        this.config.provider === 'hubspot'
          ? properties.website
          : properties.AccountId;
      if (!first || !last || !context || this.config.objectType !== 'contact')
        throw new Error(
          'Map email, or first/last name plus company website (HubSpot) or AccountId (Salesforce), or an existing CRM ID.',
        );
      let ids: string[];
      if (this.config.provider === 'hubspot') {
        const filters = [
          { propertyName: 'firstname', operator: 'EQ', value: first },
          { propertyName: 'lastname', operator: 'EQ', value: last },
          {
            propertyName: 'website',
            operator: 'IN',
            values: websiteVariants(context),
          },
        ];
        const d = await this.request(this.path + '/search', 'POST', {
          filterGroups: [{ filters }],
          limit: 2,
        });
        ids = (d.results || []).map((r: { id: string }) => String(r.id));
      } else {
        const q = `SELECT Id FROM Contact WHERE FirstName = ${quote(first)} AND LastName = ${quote(last)} AND AccountId = ${quote(context)} LIMIT 2`;
        const d = await this.request('/query?q=' + encodeURIComponent(q));
        ids = (d.records || []).map((r: { Id: string }) => r.Id);
      }
      if (ids.length > 1)
        throw new Error(
          'Multiple CRM matches; choose a record ID before writing.',
        );
      return ids[0];
    }
    if (this.config.provider === 'hubspot' && !company) {
      try {
        const d = await this.request(
          this.path + '/' + encodeURIComponent(value) + '?idProperty=email',
        );
        return String(d.id);
      } catch (e) {
        if ((e as { httpStatus?: number }).httpStatus === 404) return undefined;
        throw e;
      }
    }
    let ids: string[];
    if (this.config.provider === 'hubspot') {
      const d = await this.request(this.path + '/search', 'POST', {
        filterGroups: [
          { filters: [{ propertyName: key, operator: 'EQ', value }] },
        ],
        limit: 2,
      });
      ids = (d.results || []).map((r: { id: string }) => String(r.id));
    } else {
      let predicate = `${key} = ${quote(value)}`;
      if (company) {
        const domain = new URL(
          value.includes('://') ? value : 'https://' + value,
        ).hostname.replace(/^www\./, '');
        const variants = [
          domain,
          'www.' + domain,
          'https://' + domain,
          'https://' + domain + '/',
          'http://' + domain,
          'http://' + domain + '/',
          'https://www.' + domain,
          'https://www.' + domain + '/',
          'http://www.' + domain,
          'http://www.' + domain + '/',
        ];
        predicate = `Website IN (${variants.map(quote).join(',')})`;
      }
      const d = await this.request(
        '/query?q=' +
          encodeURIComponent(
            `SELECT Id FROM ${objectName(this.config)} WHERE ${predicate} LIMIT 2`,
          ),
      );
      ids = (d.records || []).map((r: { Id: string }) => r.Id);
    }
    if (ids.length > 1)
      throw new Error(
        'Multiple CRM matches; choose a record ID before writing.',
      );
    return ids[0];
  }
  async write(id: string | undefined, properties: Record<string, string>) {
    const d = await this.request(
      this.path + (id ? '/' + id : ''),
      id ? 'PATCH' : 'POST',
      this.config.provider === 'hubspot' ? { properties } : properties,
    );
    const nativeId = id || d.id;
    if (!nativeId) throw new Error('CRM did not return the created record ID.');
    return String(nativeId);
  }
}
const equal = (a: Record<string, string>, b: Record<string, string>) =>
  Object.entries(a).every(
    ([k, v]) => comparable(k, v) === comparable(k, b[k] ?? ''),
  );
export function validateCrmSyncConfig(
  workspace: WorkspaceSnapshot,
  config: CrmSyncConfig,
) {
  const allowed = crmFields(config.provider, config.objectType);
  const mapping = Object.entries(config.mapping || {});
  const columns = new Set(workspace.columns.map((c) => c.id));
  if (
    !mapping.length ||
    mapping.some(([key, id]) => !allowed.includes(key) || !columns.has(id)) ||
    (config.idColumn && !columns.has(config.idColumn))
  )
    throw new Error('Choose valid mapped columns.');
}
export async function previewCrmSync(
  workspace: WorkspaceSnapshot,
  rowIds: string[],
  config: CrmSyncConfig,
  options: CrmSourceOptions,
): Promise<CrmSyncPlan> {
  const mapping = Object.entries(config.mapping || {});
  if (
    !rowIds.length ||
    rowIds.length > 25 ||
    new Set(rowIds).size !== rowIds.length
  )
    throw new Error('Select 1–25 unique rows.');
  validateCrmSyncConfig(workspace, config);
  const client = new CrmSyncClient(config, options),
    actions: CrmSyncAction[] = [],
    seen = new Set<string>();
  for (const rowId of rowIds) {
    const row = workspace.rows.find((r) => r.id === rowId);
    if (!row) throw new Error('A selected row no longer exists.');
    const properties = Object.fromEntries(
      mapping
        .map(([key, id]) => [key, (row.values[id] || '').trim()])
        .filter(([, v]) => v),
    );
    const action: CrmSyncAction = {
      rowId,
      label: row.values.person || row.values.company || rowId,
      properties,
      before: {},
      action: 'review',
      status: 'pending',
    };
    try {
      if (!Object.keys(properties).length)
        throw new Error('No nonblank mapped values.');
      const email = properties.email || properties.Email;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error('Invalid email address.');
      if (
        properties.AccountId &&
        !/^[a-zA-Z0-9]{15,18}$/.test(properties.AccountId)
      )
        throw new Error('Invalid Salesforce Account ID.');
      let id = config.idColumn
        ? row.values[config.idColumn]?.trim()
        : undefined;
      if (!id) id = await client.find(properties);
      const identity =
        config.objectType === 'company' || config.objectType === 'account'
          ? properties.domain || properties.Website
          : email ||
            JSON.stringify([
              properties.firstname || properties.FirstName,
              properties.lastname || properties.LastName,
              properties.website || properties.AccountId,
            ]);
      const key =
        id || JSON.stringify([config.objectType, identity]).toLowerCase();
      if (seen.has(key))
        throw new Error('Duplicate destination in this selection.');
      seen.add(key);
      action.nativeId = id;
      if (id) {
        action.before = await client.read(id, Object.keys(properties));
        action.action = equal(properties, action.before)
          ? 'unchanged'
          : 'update';
      } else {
        if (config.objectType === 'account' && !properties.Name)
          throw new Error('Account Name is required.');
        if (
          config.provider === 'salesforce' &&
          config.objectType !== 'account' &&
          !properties.LastName
        )
          throw new Error('LastName is required.');
        if (config.objectType === 'lead' && !properties.Company)
          throw new Error('Lead Company is required.');
        if (config.objectType === 'company' && !properties.name)
          throw new Error('Company name is required.');
        action.action = 'create';
      }
    } catch (e) {
      action.message = e instanceof Error ? e.message : 'Preview failed';
      action.action = 'review';
    }
    actions.push(action);
  }
  return {
    id: crypto.randomUUID(),
    workspaceId: workspace.id,
    revision: workspace.revision || 0,
    config,
    actions,
    createdAt: Date.now(),
    status: 'preview',
  };
}
export async function executeCrmAction(
  action: CrmSyncAction,
  client: CrmSyncClient,
): Promise<CrmSyncAction> {
  if (action.action === 'review') return { ...action, status: 'failed' };
  let nativeId = action.nativeId,
    attempted = false,
    written = false;
  try {
    if (nativeId) {
      const current = await client.read(
        nativeId,
        Object.keys(action.properties),
      );
      if (!equal(action.before, current))
        throw new Error('CRM values changed after preview; preview again.');
    } else if (await client.find(action.properties))
      throw new Error(
        'A matching record appeared after preview; preview again.',
      );
    if (action.action !== 'unchanged') {
      attempted = true;
      nativeId = await client.write(nativeId, action.properties);
      written = true;
    }
    const after = await client.read(nativeId!, Object.keys(action.properties));
    if (!equal(action.properties, after))
      return {
        ...action,
        nativeId,
        status: 'uncertain',
        observed: after,
        message:
          'CRM accepted the request but returned different values. Inspect this record before retrying.',
      };
    return {
      ...action,
      nativeId,
      status: 'verified',
      observed: after,
      message:
        action.action === 'unchanged'
          ? 'Already matches; no write.'
          : 'Write verified by reading the CRM record.',
    };
  } catch (e) {
    return {
      ...action,
      nativeId,
      status:
        attempted &&
        (written ||
          !(
            (e as { httpStatus?: number }).httpStatus! >= 400 &&
            (e as { httpStatus?: number }).httpStatus! < 500
          ))
          ? 'uncertain'
          : 'failed',
      message: e instanceof Error ? e.message : 'CRM write failed',
    };
  }
}
