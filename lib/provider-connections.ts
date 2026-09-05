import { httpConnections, type HttpConnection } from './http-enrichment';
import { APOLLO_COMPANY_CONNECTION } from './provider-presets';
export function configuredHttpConnections(env: {
  POMADE_HTTP_CONNECTIONS?: string;
  APOLLO_API_KEY?: string;
}): HttpConnection[] {
  const custom = httpConnections(env.POMADE_HTTP_CONNECTIONS);
  if (custom.some((c) => c.id === APOLLO_COMPANY_CONNECTION))
    throw new Error(
      'pomade_apollo_company is reserved for the built-in Apollo connection. Rename the custom connection.',
    );
  const key = env.APOLLO_API_KEY?.trim();
  return key
    ? [
        ...custom,
        {
          id: APOLLO_COMPANY_CONNECTION,
          label: 'Apollo company enrichment',
          origin: 'https://api.apollo.io',
          methods: ['GET'],
          headers: { 'x-api-key': key },
        },
      ]
    : custom;
}
