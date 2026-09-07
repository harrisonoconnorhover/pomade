import { httpConnections, type HttpConnection } from './http-enrichment';
import {
  LEADMAGIC_CONNECTION,
  APOLLO_COMPANY_CONNECTION,
  APOLLO_PEOPLE_CONNECTION,
  HUNTER_CONNECTION,
  PROSPEO_CONNECTION,
  PDL_COMPANY_CONNECTION,
} from './provider-presets';
export function configuredHttpConnections(env: {
  POMADE_HTTP_CONNECTIONS?: string;
  APOLLO_API_KEY?: string;
  HUNTER_API_KEY?: string;
  LEADMAGIC_API_KEY?: string;
  PROSPEO_API_KEY?: string;
  PDL_API_KEY?: string;
}): HttpConnection[] {
  const custom = httpConnections(env.POMADE_HTTP_CONNECTIONS);
  const reserved = [
    LEADMAGIC_CONNECTION,
    APOLLO_COMPANY_CONNECTION,
    APOLLO_PEOPLE_CONNECTION,
    HUNTER_CONNECTION,
    PROSPEO_CONNECTION,
    PDL_COMPANY_CONNECTION,
  ];
  if (custom.some((c) => reserved.includes(c.id)))
    throw new Error(
      'Built-in provider connection IDs are reserved. Rename the custom connection.',
    );
  const connections: HttpConnection[] = [...custom];
  if (env.APOLLO_API_KEY?.trim())
    connections.push(
      {
        id: APOLLO_COMPANY_CONNECTION,
        label: 'Apollo company enrichment',
        origin: 'https://api.apollo.io',
        methods: ['GET'],
        headers: { 'x-api-key': env.APOLLO_API_KEY.trim() },
      },
      {
        id: APOLLO_PEOPLE_CONNECTION,
        label: 'Apollo people enrichment',
        origin: 'https://api.apollo.io',
        methods: ['POST'],
        headers: { 'x-api-key': env.APOLLO_API_KEY.trim() },
      },
    );
  if (env.HUNTER_API_KEY?.trim())
    connections.push({
      id: HUNTER_CONNECTION,
      label: 'Hunter',
      origin: 'https://api.hunter.io',
      methods: ['GET'],
      headers: { 'X-API-KEY': env.HUNTER_API_KEY.trim() },
    });
  if (env.PDL_API_KEY?.trim())
    connections.push({
      id: PDL_COMPANY_CONNECTION,
      label: 'People Data Labs company enrichment',
      origin: 'https://api.peopledatalabs.com',
      methods: ['GET'],
      headers: { 'X-API-Key': env.PDL_API_KEY.trim() },
    });
  if (env.PROSPEO_API_KEY?.trim())
    connections.push({
      id: PROSPEO_CONNECTION,
      label: 'Prospeo',
      // Free tier: 1/second and 20/minute. Pace ordinary sequential runs.
      requestDelayMs: 3100,
      origin: 'https://api.prospeo.io',
      methods: ['POST'],
      headers: { 'X-KEY': env.PROSPEO_API_KEY.trim() },
    });
  if (env.LEADMAGIC_API_KEY?.trim())
    connections.push({
      id: LEADMAGIC_CONNECTION,
      label: 'LeadMagic',
      origin: 'https://api.leadmagic.io',
      methods: ['POST'],
      headers: { 'X-API-Key': env.LEADMAGIC_API_KEY.trim() },
    });
  return connections;
}
