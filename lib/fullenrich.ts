import type { HttpProviderStep } from './pomade-types';

export const FULLENRICH_CONNECTION = 'pomade_fullenrich';
export const FULLENRICH_PATH = '/api/v2/contact/enrich/bulk';
export const FULLENRICH_POLL_INTERVAL_MS = 5 * 60_000;
export const FULLENRICH_WAIT_WINDOW_MS = 30 * 60_000;
type JsonObject = Record<string, unknown>;
export const fullEnrichObject = (value: unknown): JsonObject | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
const nonempty = (value: unknown) =>
  typeof value === 'string' && Boolean(value.trim());
export function validateFullEnrichRequest(url: URL, body: string | undefined) {
  const input = fullEnrichObject(JSON.parse(body ?? '{}'));
  const contacts = input?.data;
  const contact =
    Array.isArray(contacts) && contacts.length === 1
      ? fullEnrichObject(contacts[0])
      : undefined;
  if (
    url.pathname !== FULLENRICH_PATH ||
    url.search ||
    !input ||
    !contact ||
    !nonempty(input.name) ||
    input.webhook_url !== undefined ||
    input.webhook_events !== undefined
  )
    throw new Error(
      'Use a FullEnrich single-contact preset. Pomade manages result polling.',
    );
  if (
    !Array.isArray(contact.enrich_fields) ||
    contact.enrich_fields.length !== 1 ||
    ![
      'contact.work_emails',
      'contact.personal_emails',
      'contact.phones',
    ].includes(String(contact.enrich_fields[0]))
  )
    throw new Error('Choose exactly one FullEnrich contact type to enrich.');
  const profile = contact.linkedin_url;
  if (
    profile !== undefined &&
    (typeof profile !== 'string' ||
      !/^https:\/\/(?:www\.)?linkedin\.com\/in\/[^\s/?#]+\/?$/i.test(profile))
  )
    throw new Error('FullEnrich needs a regular LinkedIn profile URL.');
  if (
    !profile &&
    !(
      nonempty(contact.first_name) &&
      nonempty(contact.last_name) &&
      (nonempty(contact.domain) || nonempty(contact.company_name))
    )
  )
    throw new Error(
      'FullEnrich needs first name, last name and company domain, or a LinkedIn profile URL.',
    );
  return { input, contact };
}

export function fullEnrichStep(
  field: 'work_emails' | 'personal_emails' | 'phones',
  identifiers: Record<string, string>,
  verifiedPhone = false,
): HttpProviderStep {
  return {
    connectionId: FULLENRICH_CONNECTION,
    method: 'POST',
    pathTemplate: FULLENRICH_PATH,
    bodyTemplate: JSON.stringify({
      name: 'Pomade contact lookup',
      data: [
        {
          ...Object.fromEntries(
            Object.entries(identifiers).map(([key, column]) => [
              key,
              `{{${column}}}`,
            ]),
          ),
          enrich_fields: [`contact.${field}`],
        },
      ],
    }),
    responsePath:
      field === 'phones' ? 'pomade.phone.number' : 'pomade.email.email',
    ...(field !== 'phones'
      ? {
          verification: {
            path: 'pomade.email.status',
            acceptedValues: ['DELIVERABLE'],
          },
        }
      : verifiedPhone
        ? {
            verification: {
              path: 'pomade.phone.verified',
              acceptedValues: ['true'],
            },
          }
        : {}),
  };
}

// Status and quality always come from the same candidate as the chosen value.
export function fullEnrichContactResult(contact: JsonObject, field: unknown) {
  const info = fullEnrichObject(contact.contact_info) ?? {};
  const list = (key: string, probable: string) =>
    [info[probable], ...(Array.isArray(info[key]) ? info[key] : [])]
      .map(fullEnrichObject)
      .filter((value): value is JsonObject => Boolean(value));
  if (field === 'contact.phones') {
    const candidates = list('phones', 'most_probable_phone').filter(
      (phone) =>
        typeof phone.number === 'string' &&
        /^\+[1-9]\d{6,14}$/.test(phone.number.replace(/[\s().-]/g, '')) &&
        phone.line_type === 'MOBILE' &&
        phone.line_status !== 'INACTIVE' &&
        phone.ownership_match !== 'MISMATCH',
    );
    const verified = (phone: JsonObject) =>
      phone.line_status === 'ACTIVE' && phone.ownership_match === 'CONFIRMED';
    const phone = candidates.find(verified) ?? candidates[0];
    return {
      ...contact,
      pomade: {
        phone: phone
          ? { ...phone, verified: verified(phone) }
          : { number: '', verified: false },
      },
    };
  }
  const personal = field === 'contact.personal_emails';
  const candidates = list(
    personal ? 'personal_emails' : 'work_emails',
    personal ? 'most_probable_personal_email' : 'most_probable_work_email',
  );
  const email = candidates.find(
    (candidate) =>
      candidate.status === 'DELIVERABLE' &&
      typeof candidate.email === 'string' &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email),
  );
  return {
    ...contact,
    pomade: { email: email ?? { email: '', status: 'NO_DELIVERABLE_EMAIL' } },
  };
}
