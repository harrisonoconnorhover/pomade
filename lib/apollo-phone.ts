import type { HttpProviderStep } from './pomade-types';
export const APOLLO_PHONE_CONNECTION = 'pomade_apollo_phone';
export const APOLLO_PHONE_PATH = '/api/v1/people/match';
export const apolloObject = (
  v: unknown,
): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
export function apolloRequestId(value: unknown) {
  const id =
    typeof value === 'string'
      ? value
      : typeof value === 'number' && Number.isSafeInteger(value)
        ? String(value)
        : '';
  if (id.length > 20 || !/^-?(?:0|[1-9]\d*)$/.test(id)) return undefined;
  const n = BigInt(id);
  return n >= BigInt('-9223372036854775808') &&
    n <= BigInt('9223372036854775807')
    ? id
    : undefined;
}
// Apollo's IDs exceed Number.MAX_SAFE_INTEGER. Preserve the original numeric
// token before JSON.parse rounds it, without changing quoted strings or numbers
// belonging to other fields. Whitespace is retained so invalid JSON stays invalid.
export function parseApolloJson(text: string): unknown {
  let previous = '',
    beforePrevious = '';
  const preserved = text.replace(
    /"(?:\\[\s\S]|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[^\s]/g,
    (token) => {
      let replacement = token;
      if (
        previous === ':' &&
        beforePrevious.startsWith('"') &&
        /^-?\d+$/.test(token)
      ) {
        if (JSON.parse(beforePrevious) === 'request_id')
          replacement = JSON.stringify(token);
      }
      beforePrevious = previous;
      previous = token;
      return replacement;
    },
  );
  return JSON.parse(preserved);
}
export function validApolloCallback(value?: string) {
  try {
    const u = new URL(value ?? '');
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.hash &&
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
      u.hostname.includes('.')
    );
  } catch {
    return false;
  }
}
export function validateApolloPhoneRequest(url: URL, body?: string) {
  const input = apolloObject(JSON.parse(body ?? '{}'));
  if (
    url.pathname !== APOLLO_PHONE_PATH ||
    url.search ||
    !input ||
    Object.keys(input).some(
      (k) =>
        ![
          'name',
          'domain',
          'reveal_phone_number',
          'reveal_personal_emails',
        ].includes(k),
    ) ||
    input.reveal_phone_number !== true ||
    input.reveal_personal_emails !== false ||
    !['name', 'domain'].every(
      (k) => typeof input[k] === 'string' && input[k].trim(),
    )
  )
    throw new Error(
      'Use the Apollo mobile preset with person and company domain. Personal email and Apollo vendor waterfalls are not enabled.',
    );
  return input;
}
export function apolloPhoneStep(
  person: string,
  domain: string,
): HttpProviderStep {
  return {
    connectionId: APOLLO_PHONE_CONNECTION,
    method: 'POST',
    pathTemplate: APOLLO_PHONE_PATH,
    bodyTemplate: JSON.stringify({
      name: `{{${person}}}`,
      domain: `{{${domain}}}`,
      reveal_phone_number: true,
      reveal_personal_emails: false,
    }),
    responsePath: 'pomade.mobile',
  };
}
export function apolloPhoneResult(person: Record<string, unknown>) {
  const candidates = (
    Array.isArray(person.phone_numbers) ? person.phone_numbers : []
  ).map(apolloObject);
  const mobile = candidates.find(
    (p) =>
      p?.type_cd === 'mobile' &&
      p.status_cd === 'valid_number' &&
      typeof p.sanitized_number === 'string' &&
      /^\+[1-9]\d{6,14}$/.test(p.sanitized_number),
  );
  return {
    ...person,
    pomade: {
      mobile: mobile?.sanitized_number ?? '',
      status: mobile?.status_cd ?? '',
      dnc_status: mobile?.dnc_status_cd ?? '',
    },
  };
}
