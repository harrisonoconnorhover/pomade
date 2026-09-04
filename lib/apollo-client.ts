import type { ApolloEnrichmentResult } from './pomade-types';

const APOLLO_PEOPLE_MATCH_URL = 'https://api.apollo.io/api/v1/people/match';

export type ApolloPersonInput = {
  fullName: string;
  companyDomain: string;
  organizationName?: string;
};

export type ApolloClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalCredits(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function splitName(value: string | null | undefined) {
  const parts = normalizedText(value).split(' ').filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.at(-1) ?? '' };
}

function namesMatch(requested: string, returned: string | null) {
  const input = splitName(requested);
  const match = splitName(returned);
  return Boolean(
    input.firstName &&
    input.lastName &&
    input.firstName === match.firstName &&
    input.lastName === match.lastName,
  );
}

export function normalizeCompanyDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) throw new Error('A company domain is required.');
  try {
    const url = new URL(
      trimmed.includes('://') ? trimmed : `https://${trimmed}`,
    );
    const hostname = url.hostname.replace(/^www\./, '');
    if (!hostname.includes('.') || hostname.includes(' ')) throw new Error();
    return hostname;
  } catch {
    throw new Error(`"${value}" is not a valid company domain.`);
  }
}

function emailDomainMatches(email: string, domain: string) {
  const emailDomain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  return emailDomain === domain || emailDomain.endsWith(`.${domain}`);
}

function domainMatches(returned: string | null, requested: string) {
  if (!returned) return true;
  try {
    return normalizeCompanyDomain(returned) === requested;
  } catch {
    return false;
  }
}

function validEmail(value: string | null): string | null {
  const email = value?.trim().toLowerCase() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function safeApolloDetail(value: unknown) {
  const payload = record(value);
  const detail =
    optionalString(payload?.message) ||
    optionalString(payload?.error_description) ||
    optionalString(payload?.error);
  return detail
    ? ` Apollo said: ${detail.replace(/\s+/g, ' ').slice(0, 240)}`
    : '';
}

async function errorForResponse(response: Response): Promise<Error> {
  const status = response.status;
  const retryAfter = response.headers.get('retry-after');
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text ? { message: text } : null;
  }
  const detail = safeApolloDetail(payload);
  if (status === 401)
    return new Error(`Apollo rejected the configured API key.${detail}`);
  if (status === 403) {
    return new Error(
      `Apollo denied People Enrichment (HTTP 403). Free accounts need a work-email login, and the key or workspace must allow people/match.${detail}`,
    );
  }
  if (status === 429) {
    const suffix = retryAfter
      ? ` Try again in ${retryAfter} seconds.`
      : ' Try again later.';
    return new Error(`Apollo's API limit was reached.${suffix}${detail}`);
  }
  if (status === 422)
    return new Error(
      `Apollo could not match that person and company input.${detail}`,
    );
  return new Error(
    `Apollo People Enrichment failed with HTTP ${status}.${detail}`,
  );
}

function locationFrom(person: Record<string, unknown>) {
  return (
    [
      optionalString(person.city),
      optionalString(person.state),
      optionalString(person.country),
    ]
      .filter(Boolean)
      .join(', ') || null
  );
}

export class ApolloClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApolloClientOptions) {
    this.apiKey = options.apiKey.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async enrichPerson(
    input: ApolloPersonInput,
  ): Promise<ApolloEnrichmentResult> {
    if (!this.apiKey) throw new Error('APOLLO_API_KEY is not configured.');
    const fullName = input.fullName.trim();
    if (normalizedText(fullName).split(' ').filter(Boolean).length < 2) {
      throw new Error('A full person name is required.');
    }
    const domain = normalizeCompanyDomain(input.companyDomain);

    const url = new URL(APOLLO_PEOPLE_MATCH_URL);
    url.searchParams.set('name', fullName);
    url.searchParams.set('domain', domain);
    url.searchParams.set('reveal_personal_emails', 'false');
    url.searchParams.set('reveal_phone_number', 'false');
    if (input.organizationName?.trim()) {
      url.searchParams.set('organization_name', input.organizationName.trim());
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new Error(
        `Apollo could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      throw await errorForResponse(response);
    }

    const payload = record(await response.json());
    if (!payload) throw new Error('Apollo returned an invalid JSON response.');
    const person = record(payload.person);
    const creditsConsumed = optionalCredits(payload.credits_consumed);

    if (!person) {
      return {
        personId: null,
        fullName: null,
        title: null,
        workEmail: null,
        candidateEmail: null,
        emailStatus: null,
        linkedinUrl: null,
        location: null,
        organizationDomain: null,
        status: 'not_found',
        evidence: [
          'Apollo did not match a person for this name and company domain.',
        ],
        creditsConsumed,
        cached: false,
      };
    }

    const organization = record(person.organization);
    const returnedName = optionalString(person.name);
    const returnedDomain = optionalString(organization?.primary_domain);
    const returnedEmail = validEmail(optionalString(person.email));
    const emailStatus = optionalString(person.email_status);
    const sameName = namesMatch(fullName, returnedName);
    const sameOrganization = domainMatches(returnedDomain, domain);
    const sameEmailDomain = returnedEmail
      ? emailDomainMatches(returnedEmail, domain)
      : false;
    const verifiedEmail = normalizedText(emailStatus) === 'verified';
    const identityAccepted = sameName && sameOrganization;
    const emailAccepted =
      identityAccepted &&
      Boolean(returnedEmail && sameEmailDomain && verifiedEmail);

    const evidence = [
      sameName
        ? 'Apollo matched the requested first and last name.'
        : 'Apollo returned a different person name.',
      sameOrganization
        ? `Apollo matched the requested company domain ${domain}.`
        : `Apollo returned a company domain that conflicts with ${domain}.`,
      returnedEmail
        ? verifiedEmail
          ? 'Apollo reports the work email as verified.'
          : `Apollo reports the work email as ${emailStatus ?? 'unverified'}.`
        : 'Apollo returned no work email.',
    ];
    if (returnedEmail && !sameEmailDomain) {
      evidence.push(
        `The returned email does not use the requested company domain ${domain}.`,
      );
    }

    return {
      personId: identityAccepted ? optionalString(person.id) : null,
      fullName: identityAccepted ? returnedName : null,
      title: identityAccepted ? optionalString(person.title) : null,
      workEmail: emailAccepted ? returnedEmail : null,
      candidateEmail: identityAccepted && !emailAccepted ? returnedEmail : null,
      emailStatus,
      linkedinUrl: identityAccepted
        ? optionalString(person.linkedin_url)
        : null,
      location: identityAccepted ? locationFrom(person) : null,
      organizationDomain: returnedDomain,
      status: emailAccepted ? 'found' : 'needs_review',
      evidence,
      creditsConsumed,
      cached: false,
    };
  }
}

export async function apolloCacheKey(input: ApolloPersonInput) {
  const normalized = JSON.stringify([
    'apollo-person-v1',
    normalizedText(input.fullName),
    normalizeCompanyDomain(input.companyDomain),
  ]);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
