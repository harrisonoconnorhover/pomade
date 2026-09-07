import {
  ProviderPendingError,
  ProviderSubmissionUnknownError,
} from './async-provider';

export const ENROW_CONNECTION = 'pomade_enrow';
export const ENROW_PATHS = [
  '/email/find/single',
  '/email/verify/single',
  '/phone/single',
] as const;
export const ENROW_POLL_INTERVAL_MS = 15_000;
export const ENROW_WAIT_WINDOW_MS = 30 * 60_000;

export class EnrowPendingError extends ProviderPendingError {}
export class EnrowSubmissionUnknownError extends ProviderSubmissionUnknownError {
  constructor() {
    super('Enrow');
  }
}

export function validateEnrowRequest(url: URL, body: string | undefined) {
  if (!ENROW_PATHS.some((path) => path === url.pathname) || url.search)
    throw new Error(
      'Use an Enrow single-contact preset. Its result polling is managed by Pomade.',
    );
  const input = JSON.parse(body ?? '{}') as Record<string, unknown>;
  if (
    url.pathname === '/email/find/single' &&
    (typeof input.fullname !== 'string' ||
      !input.fullname.trim() ||
      typeof input.company_domain !== 'string' ||
      !input.company_domain.trim())
  )
    throw new Error(
      'Enrow email finding needs a full name and company domain.',
    );
  if (
    url.pathname === '/email/verify/single' &&
    (typeof input.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
  )
    throw new Error('Enrow verification needs a valid email address.');
  if (
    url.pathname === '/phone/single' &&
    (typeof input.linkedin_url !== 'string' ||
      !/^https:\/\/(?:www\.)?linkedin\.com\/(?:in|pub)\/[^\s?#]+\/?$/i.test(
        input.linkedin_url,
      ))
  )
    throw new Error(
      'Enrow phone finding needs a regular LinkedIn profile URL.',
    );
  return input;
}

// A completed phone search is "found", not proof of ownership or reachability.
export function enrowResult(
  url: URL,
  input: Record<string, unknown>,
  data: unknown,
) {
  if (!data || typeof data !== 'object')
    throw new Error('Enrow returned an invalid result.');
  const result = data as Record<string, unknown>;
  if (result.qualification === 'ongoing') return null;
  const phone = url.pathname === '/phone/single';
  if (
    !(phone ? ['found', 'not_found'] : ['valid', 'invalid']).includes(
      String(result.qualification),
    )
  )
    throw new Error(
      'Enrow returned an unrecognized qualification; result withheld.',
    );
  if (
    url.pathname === '/email/verify/single' &&
    (typeof result.email !== 'string' ||
      result.email.toLowerCase() !== String(input.email).toLowerCase())
  )
    throw new Error(
      'Enrow returned verification for a different email; result withheld.',
    );
  const params = result.params as Record<string, unknown> | undefined;
  if (
    phone &&
    params?.linkedin_url !== undefined &&
    (typeof params.linkedin_url !== 'string' ||
      params.linkedin_url.replace(/\/$/, '').toLowerCase() !==
        String(input.linkedin_url).replace(/\/$/, '').toLowerCase())
  )
    throw new Error('Enrow returned a different profile; result withheld.');
  const found = result.qualification === (phone ? 'found' : 'valid');
  const field = phone ? 'number' : 'email';
  if (found && (typeof result[field] !== 'string' || !result[field].trim()))
    throw new Error(
      'Enrow marked the lookup successful but returned no contact value.',
    );
  // Even a custom format-only acceptance rule must not accept a rejected value.
  return found ? result : { ...result, [field]: '' };
}
