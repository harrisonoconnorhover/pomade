import type {
  CrmProvider,
  CrmSourceContact,
  CrmSourcePreview,
} from './pomade-types';

export type CrmSourceOptions = {
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
  const url = new URL('https://api.hubapi.com/crm/objects/2026-03/contacts');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('properties', HUBSPOT_PROPERTIES.join(','));
  url.searchParams.set('archived', 'false');

  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  const payload = await responsePayload(response);
  const body = record(payload);
  if (!response.ok || !Array.isArray(body?.results)) {
    throw new Error(
      `HubSpot contacts read failed with HTTP ${response.status}.${safeDetail(payload)}`,
    );
  }
  return body.results
    .map(hubSpotContact)
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
  const query = `SELECT Id, FirstName, LastName, Email, Company, Phone, MobilePhone, Title, Website FROM Lead WHERE IsConverted = FALSE ORDER BY LastModifiedDate DESC LIMIT ${limit}`;
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
      `Salesforce Leads read failed with HTTP ${response.status}.${safeDetail(payload)}`,
    );
  }
  return body.records
    .map(salesforceLead)
    .filter((contact): contact is CrmSourceContact => Boolean(contact));
}

export async function readCrmSource(
  provider: CrmProvider,
  requestedLimit: number,
  options: CrmSourceOptions,
): Promise<CrmSourcePreview> {
  const limit = normalizeLimit(requestedLimit);
  const contacts =
    provider === 'hubspot'
      ? await readHubSpot(limit, options)
      : await readSalesforce(limit, options);
  return {
    provider,
    sourceLabel:
      provider === 'hubspot' ? 'HubSpot contacts' : 'Salesforce leads',
    contacts,
    truncated: contacts.length >= limit,
    readAt: (options.now ?? (() => new Date()))().toISOString(),
  };
}
