const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const phoneText = (value: unknown) =>
  typeof value === 'string' ? value.replace(/[\s().-]/g, '') : '';

// Only source-derived fields go under `pomade`; raw vendor statuses stay intact.
export function normalizeContactProviderResponse(
  connectionId: string,
  url: URL,
  data: unknown,
): unknown {
  if (
    connectionId === 'pomade_contactout' &&
    url.pathname === '/v1/people/linkedin'
  ) {
    const body = record(data);
    if (body.status_code === 404) return {};
    if (
      body.error ||
      (typeof body.status_code === 'number' && body.status_code !== 200)
    )
      throw new Error(
        'ContactOut rejected the request. Check account access, credits, and inputs.',
      );
    const profile = record(body.profile);
    if (
      profile.url &&
      normalizedProfile(profile.url) !==
        normalizedProfile(url.searchParams.get('profile'))
    )
      throw new Error(
        'ContactOut returned a different profile. Results withheld for review.',
      );
    const statuses = record(profile.work_email_status);
    const emails = Array.isArray(profile.work_email)
      ? profile.work_email.filter(
          (email): email is string => typeof email === 'string',
        )
      : [];
    const email =
      emails.find(
        (email) =>
          typeof statuses[email] === 'string' &&
          statuses[email].toLowerCase() === 'verified',
      ) ??
      emails[0] ??
      '';
    const phones = Array.isArray(profile.phone)
      ? profile.phone.map(phoneText)
      : [];
    return {
      ...body,
      pomade: {
        work_email: email,
        work_email_status: statuses[email] ?? '',
        phone: phones.find((phone) => /^\+[1-9]\d{6,14}$/.test(phone)) ?? '',
      },
    };
  }
  if (
    connectionId === 'pomade_pdl_people' &&
    url.pathname === '/v5/person/enrich'
  ) {
    const body = record(data);
    if (body.status === 404) return {};
    if (body.error || (typeof body.status === 'number' && body.status !== 200))
      throw new Error(
        'People Data Labs rejected the request. Check the account and request inputs.',
      );
    const minimum = Number(url.searchParams.get('min_likelihood') ?? 0);
    if (
      minimum > 0 &&
      (typeof body.likelihood !== 'number' || body.likelihood < minimum)
    )
      throw new Error(
        'People Data Labs did not meet the requested person-match confidence. Results withheld for review.',
      );
    const required = url.searchParams.get('required') ?? '';
    if (
      ['work_email', 'mobile_phone', 'recommended_personal_email'].includes(
        required,
      ) &&
      typeof record(body.data)[required] === 'boolean'
    )
      throw new Error(
        'People Data Labs returned a field-availability flag. Your plan did not reveal the contact value.',
      );
  }
  if (
    connectionId === 'pomade_trestle' &&
    url.pathname === '/3.0/phone_intel'
  ) {
    const body = record(data);
    if (body.error)
      throw new Error(
        'Trestle could not return a complete validation. Results withheld for review.',
      );
    if (body.is_valid !== true) return { ...body, pomade: { phone: '' } };
    const requested = phoneText(url.searchParams.get('phone'));
    const returned = phoneText(body.phone_number);
    const callingCode = phoneText(body.country_calling_code).replace(/^\+/, '');
    // Do not guess a country or strip a national trunk prefix. Only emit the
    // user's international input when the provider returned the same number.
    if (
      !/^\+[1-9]\d{6,14}$/.test(requested) ||
      !returned ||
      (returned !== requested &&
        (!/^[1-9]\d{0,2}$/.test(callingCode) ||
          `+${callingCode}${returned}` !== requested))
    )
      throw new Error(
        'Trestle returned no matching international phone number. Results withheld for review.',
      );
    return { ...body, pomade: { phone: requested } };
  }
  return data;
}

export function validateContactProviderRequest(
  connectionId: string,
  url: URL,
  body?: string,
) {
  if (
    connectionId === 'pomade_trestle' &&
    url.pathname === '/3.0/phone_intel' &&
    !/^\+[1-9]\d{6,14}$/.test(phoneText(url.searchParams.get('phone')))
  )
    throw new Error(
      'Enter a phone number with its country code before running validation.',
    );
  if (
    connectionId === 'pomade_contactout' &&
    url.pathname === '/v1/people/linkedin' &&
    !normalizedProfile(url.searchParams.get('profile'))
  )
    throw new Error(
      'Use a regular LinkedIn profile URL; Sales Navigator and Recruiter URLs are not supported.',
    );
  const emailVerifiers: Record<string, string> = {
    pomade_findymail: '/api/verify',
    pomade_hunter: '/v2/email-verifier',
    pomade_leadmagic: '/v1/people/email-validation',
    pomade_zerobounce: '/v2/validate',
  };
  if (emailVerifiers[connectionId] === url.pathname) {
    const email =
      url.searchParams.get('email') ??
      record(body ? JSON.parse(body) : {}).email;
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error(
        'Enter a valid email format before running verification.',
      );
  }
}

function normalizedProfile(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !/(^|\.)linkedin\.com$/.test(url.hostname) ||
      !/^\/(in|pub)\/[^/]+/.test(url.pathname)
    )
      return '';
    return url.pathname.replace(/\/$/, '').toLowerCase();
  } catch {
    return '';
  }
}
