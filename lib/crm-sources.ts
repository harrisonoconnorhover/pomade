import type {
  CrmProvider,
  CrmObjectType,
  CrmSourceContact,
  CrmSourcePreview,
} from './pomade-types';

export type CrmSourceOptions = {
  objectType?: CrmObjectType;
  recordIds?: string[];
  hubSpotAccessToken?: string;
  salesforceInstanceUrl?: string;
  salesforceAccessToken?: string;
  salesforceApiVersion?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

const HUBSPOT_PROPERTIES = [
  'email',
  'firstname',
  'lastname',
  'company',
  'phone',
  'mobilephone',
  'jobtitle',
  'website',
];

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeDetail(payload: unknown) {
  const body = record(payload);
  const detail =
    stringValue(body?.message) ||
    stringValue(body?.error_description) ||
    stringValue(body?.error);
  return detail ? ` ${detail.replace(/\s+/g, ' ').slice(0, 240)}` : '';
}

async function responsePayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 240) };
  }
}

function normalizeLimit(limit: number) {
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(100, Math.floor(limit)));
}

function normalizeSalesforceOrigin(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') throw new Error();
    return url.origin;
  } catch {
    throw new Error('Salesforce is configured with an invalid instance URL.');
  }
}

function hubSpotContact(value: unknown): CrmSourceContact | null {
  const item = record(value);
  const properties = record(item?.properties);
  const nativeId = stringValue(item?.id);
  if (!nativeId) return null;
  const firstName = stringValue(properties?.firstname);
  const lastName = stringValue(properties?.lastname);
  return {
    nativeId,
    objectType: 'contact',
    fullName: [firstName, lastName].filter(Boolean).join(' '),
    firstName,
    lastName,
    email: stringValue(properties?.email),
    company: stringValue(properties?.company),
    phone:
      stringValue(properties?.phone) || stringValue(properties?.mobilephone),
    jobTitle: stringValue(properties?.jobtitle),
    website: stringValue(properties?.website),
  };
}

function salesforceLead(value: unknown): CrmSourceContact | null {
  const item = record(value);
  const nativeId = stringValue(item?.Id);
  if (!nativeId) return null;
  const firstName = stringValue(item?.FirstName);
  const lastName = stringValue(item?.LastName);
  return {
    nativeId,
    objectType: 'lead',
    fullName: [firstName, lastName].filter(Boolean).join(' '),
    firstName,
    lastName,
    email: stringValue(item?.Email),
    company: stringValue(item?.Company),
    phone: stringValue(item?.Phone) || stringValue(item?.MobilePhone),
    jobTitle: stringValue(item?.Title),
    website: stringValue(item?.Website),
  };
}

async function readHubSpot(
  limit: number,
  options: CrmSourceOptions,
): Promise<CrmSourceContact[]> {
  const token = options.hubSpotAccessToken?.trim();
  if (!token) throw new Error('HubSpot is not configured.');
  const company = options.objectType === 'company';
  const object = company ? 'companies' : 'contacts';
  const url = new URL(`https://api.hubapi.com/crm/objects/2026-03/${object}`);
  url.searchParams.set('limit', String(limit));
  const properties = company
    ? ['name', 'domain', 'website', 'phone', 'description']
    : HUBSPOT_PROPERTIES;
  url.searchParams.set('properties', properties.join(','));
  url.searchParams.set('archived', 'false');

  const ids = options.recordIds;
  if (ids?.length) {
    url.pathname += '/batch/read';
    url.search = '';
  }
  const response = await (options.fetchImpl ?? fetch)(url, {
    ...(ids?.length
      ? {
          method: 'POST',
          body: JSON.stringify({
            properties,
            inputs: ids.map((id) => ({ id })),
          }),
        }
      : {}),
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  const payload = await responsePayload(response);
  const body = record(payload);
  if (!response.ok || !Array.isArray(body?.results)) {
    throw new Error(
      `HubSpot ${object} read failed with HTTP ${response.status}.${safeDetail(payload)}`,
    );
  }
  return body.results
    .map((value: unknown) => {
      if (!company) return hubSpotContact(value);
      const item = record(value),
        props = record(item?.properties),
        nativeId = stringValue(item?.id);
      return nativeId
        ? {
            nativeId,
            objectType: 'company' as const,
            company: stringValue(props?.name),
            website: stringValue(props?.domain) || stringValue(props?.website),
            description: stringValue(props?.description),
            phone: stringValue(props?.phone),
            fullName: '',
            firstName: '',
            lastName: '',
            email: '',
            jobTitle: '',
          }
        : null;
    })
    .filter((contact): contact is CrmSourceContact => Boolean(contact));
}

async function readSalesforce(
  limit: number,
  options: CrmSourceOptions,
): Promise<CrmSourceContact[]> {
  const token = options.salesforceAccessToken?.trim();
  const instanceUrl = options.salesforceInstanceUrl?.trim();
  if (!token || !instanceUrl) throw new Error('Salesforce is not configured.');
  const origin = normalizeSalesforceOrigin(instanceUrl);
  const apiVersion = options.salesforceApiVersion?.trim() || '67.0';
  if (!/^\d{2}\.\d$/.test(apiVersion)) {
    throw new Error('Salesforce is configured with an invalid API version.');
  }
  const object =
    options.objectType === 'account'
      ? 'Account'
      : options.objectType === 'contact'
        ? 'Contact'
        : 'Lead';
  const fields =
    object === 'Account'
      ? 'Id, Name, Website, Phone, Description'
      : object === 'Contact'
        ? 'Id, FirstName, LastName, Email, Phone, MobilePhone, Title, AccountId, Account.Name, Account.Website'
        : 'Id, FirstName, LastName, Email, Company, Phone, MobilePhone, Title, Website';
  const where = options.recordIds?.length
    ? ` WHERE Id IN (${options.recordIds.map((id) => "'" + id + "'").join(',')})`
    : object === 'Lead'
      ? ' WHERE IsConverted = FALSE'
      : '';
  const query = `SELECT ${fields} FROM ${object}${where} ORDER BY LastModifiedDate DESC LIMIT ${limit}`;
  const url = new URL(`${origin}/services/data/v${apiVersion}/query`);
  url.searchParams.set('q', query);
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  const payload = await responsePayload(response);
  const body = record(payload);
  if (!response.ok || !Array.isArray(body?.records)) {
    throw new Error(
      `Salesforce ${object} read failed with HTTP ${response.status}.${safeDetail(payload)}`,
    );
  }
  return body.records
    .map((value: unknown) => {
      const item = record(value);
      if (!item) return null;
      if (object === 'Lead') return salesforceLead(item);
      if (object === 'Contact') {
        const contact = salesforceLead(item);
        const account = record(item.Account);
        return contact
          ? {
              ...contact,
              objectType: 'contact' as const,
              accountId: stringValue(item.AccountId),
              company: stringValue(account?.Name),
              website: stringValue(account?.Website),
            }
          : null;
      }
      const nativeId = stringValue(item.Id);
      return nativeId
        ? {
            nativeId,
            objectType: 'account' as const,
            company: stringValue(item.Name),
            website: stringValue(item.Website),
            description: stringValue(item.Description),
            phone: stringValue(item.Phone),
            fullName: '',
            firstName: '',
            lastName: '',
            email: '',
            jobTitle: '',
          }
        : null;
    })
    .filter((contact): contact is CrmSourceContact => Boolean(contact));
}

export async function readCrmSource(
  provider: CrmProvider,
  requestedLimit: number,
  options: CrmSourceOptions,
): Promise<CrmSourcePreview> {
  const object =
    options.objectType ?? (provider === 'hubspot' ? 'contact' : 'lead');
  if (
    !(
      provider === 'hubspot'
        ? ['contact', 'company']
        : ['contact', 'account', 'lead']
    ).includes(object)
  )
    throw new Error('Unsupported CRM object.');
  if (
    options.recordIds &&
    (!Array.isArray(options.recordIds) ||
      options.recordIds.length > 100 ||
      options.recordIds.some(
        (id) => typeof id !== 'string' || !/^[a-zA-Z0-9]{1,30}$/.test(id),
      ))
  )
    throw new Error('Invalid CRM record IDs.');
  const limit = normalizeLimit(requestedLimit);
  const contacts =
    provider === 'hubspot'
      ? await readHubSpot(limit, options)
      : await readSalesforce(limit, options);
  return {
    provider,
    sourceLabel: `${provider === 'hubspot' ? 'HubSpot' : 'Salesforce'} ${object === 'company' ? 'companies' : object + 's'}`,
    contacts,
    truncated: contacts.length >= limit,
    readAt: (options.now ?? (() => new Date()))().toISOString(),
  };
}
