import type { HttpProviderStep } from './pomade-types';
export const DROPCONTACT_CONNECTION = 'pomade_dropcontact';
export const DROPCONTACT_PATH = '/v1/enrich/all';
export const dropcontactObject = (
  v: unknown,
): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
export function validateDropcontactRequest(url: URL, body?: string) {
  const input = dropcontactObject(JSON.parse(body ?? '{}'));
  const contact =
    Array.isArray(input?.data) && input.data.length === 1
      ? dropcontactObject(input.data[0])
      : undefined;
  if (
    url.pathname !== DROPCONTACT_PATH ||
    url.search ||
    !input ||
    !contact ||
    Object.keys(input).some((k) => !['data', 'language'].includes(k)) ||
    Object.keys(contact).some(
      (k) => !['first_name', 'last_name', 'website'].includes(k),
    ) ||
    !['first_name', 'last_name', 'website'].every(
      (k) => typeof contact[k] === 'string' && contact[k].trim(),
    )
  )
    throw new Error(
      'Use the Dropcontact single-person email preset with first name, last name and company website. Pomade manages polling.',
    );
  return { input, contact };
}
export function dropcontactStep(
  first_name: string,
  last_name: string,
  domain: string,
): HttpProviderStep {
  return {
    connectionId: DROPCONTACT_CONNECTION,
    method: 'POST',
    pathTemplate: DROPCONTACT_PATH,
    bodyTemplate: JSON.stringify({
      data: [
        {
          first_name: `{{${first_name}}}`,
          last_name: `{{${last_name}}}`,
          website: `{{${domain}}}`,
        },
      ],
      language: 'en',
    }),
    responsePath: 'pomade.email',
  };
}
export function dropcontactResult(contact: Record<string, unknown>) {
  const email = (Array.isArray(contact.email) ? contact.email : [])
    .map(dropcontactObject)
    .find(
      (v) =>
        v?.qualification === 'nominative@pro' &&
        typeof v.email === 'string' &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email),
    );
  // Qualification identifies a named work address. A separate verifier is required
  // for Pomade's strict verified-email rule; a company number is never a mobile.
  return {
    ...contact,
    pomade: {
      email: email?.email ?? '',
      qualification: email?.qualification ?? '',
    },
  };
}
