import { DROPCONTACT_CONNECTION } from './dropcontact';
import { APOLLO_PHONE_CONNECTION, validApolloCallback } from './apollo-phone';
import { FULLENRICH_CONNECTION } from './fullenrich';
import { ENROW_CONNECTION } from './enrow';
import { httpConnections, type HttpConnection } from './http-enrichment';
import {
  LEADMAGIC_CONNECTION,
  FINDYMAIL_CONNECTION,
  ZEROBOUNCE_CONNECTION,
  TRESTLE_CONNECTION,
  CONTACTOUT_CONNECTION,
  UPCELL_CONNECTION,
  BOUNCEBAN_CONNECTION,
  APOLLO_COMPANY_CONNECTION,
  APOLLO_PEOPLE_CONNECTION,
  HUNTER_CONNECTION,
  PROSPEO_CONNECTION,
  PDL_COMPANY_CONNECTION,
  PDL_PEOPLE_CONNECTION,
} from './provider-presets';
export function configuredHttpConnections(env: {
  POMADE_HTTP_CONNECTIONS?: string;
  APOLLO_API_KEY?: string;
  APOLLO_WEBHOOK_URL?: string;
  DROPCONTACT_API_KEY?: string;
  HUNTER_API_KEY?: string;
  LEADMAGIC_API_KEY?: string;
  FINDYMAIL_API_KEY?: string;
  ZEROBOUNCE_API_KEY?: string;
  TRESTLE_API_KEY?: string;
  CONTACTOUT_API_KEY?: string;
  UPCELL_API_KEY?: string;
  BOUNCEBAN_API_KEY?: string;
  ENROW_API_KEY?: string;
  FULLENRICH_API_KEY?: string;
  PROSPEO_API_KEY?: string;
  PDL_API_KEY?: string;
}): HttpConnection[] {
  const custom = httpConnections(env.POMADE_HTTP_CONNECTIONS);
  const reserved = [
    DROPCONTACT_CONNECTION,
    APOLLO_PHONE_CONNECTION,
    ENROW_CONNECTION,
    FULLENRICH_CONNECTION,
    LEADMAGIC_CONNECTION,
    FINDYMAIL_CONNECTION,
    ZEROBOUNCE_CONNECTION,
    TRESTLE_CONNECTION,
    CONTACTOUT_CONNECTION,
    UPCELL_CONNECTION,
    BOUNCEBAN_CONNECTION,
    APOLLO_COMPANY_CONNECTION,
    APOLLO_PEOPLE_CONNECTION,
    HUNTER_CONNECTION,
    PROSPEO_CONNECTION,
    PDL_COMPANY_CONNECTION,
    PDL_PEOPLE_CONNECTION,
  ];
  if (custom.some((c) => reserved.includes(c.id)))
    throw new Error(
      'Built-in provider connection IDs are reserved. Rename the custom connection.',
    );
  const connections: HttpConnection[] = [...custom];
  if (env.DROPCONTACT_API_KEY?.trim())
    connections.push({
      id: DROPCONTACT_CONNECTION,
      label: 'Dropcontact',
      origin: 'https://api.dropcontact.com',
      methods: ['POST', 'GET'],
      headers: { 'X-Access-Token': env.DROPCONTACT_API_KEY.trim() },
    });
  if (
    env.APOLLO_API_KEY?.trim() &&
    validApolloCallback(env.APOLLO_WEBHOOK_URL?.trim())
  )
    connections.push({
      id: APOLLO_PHONE_CONNECTION,
      label: 'Apollo mobile enrichment',
      origin: 'https://api.apollo.io',
      methods: ['POST', 'GET'],
      headers: { 'x-api-key': env.APOLLO_API_KEY.trim() },
      callbackUrl: env.APOLLO_WEBHOOK_URL!.trim(),
    });
  if (env.FULLENRICH_API_KEY?.trim())
    connections.push({
      id: FULLENRICH_CONNECTION,
      label: 'FullEnrich',
      origin: 'https://app.fullenrich.com',
      methods: ['GET', 'POST'],
      headers: { Authorization: `Bearer ${env.FULLENRICH_API_KEY.trim()}` },
    });
  if (env.ENROW_API_KEY?.trim())
    connections.push({
      id: ENROW_CONNECTION,
      label: 'Enrow',
      origin: 'https://api.enrow.io',
      methods: ['GET', 'POST'],
      headers: { 'x-api-key': env.ENROW_API_KEY.trim() },
    });
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
      requestTimeoutMs: 25_000,
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
  if (env.FINDYMAIL_API_KEY?.trim())
    connections.push({
      id: FINDYMAIL_CONNECTION,
      label: 'Findymail',
      origin: 'https://app.findymail.com',
      methods: ['POST'],
      headers: { Authorization: `Bearer ${env.FINDYMAIL_API_KEY.trim()}` },
    });
  if (env.ZEROBOUNCE_API_KEY?.trim())
    connections.push({
      id: ZEROBOUNCE_CONNECTION,
      label: 'ZeroBounce',
      origin: 'https://api.zerobounce.net',
      methods: ['GET'],
      headers: {},
      secretQuery: { api_key: env.ZEROBOUNCE_API_KEY.trim() },
    });
  if (env.TRESTLE_API_KEY?.trim())
    connections.push({
      id: TRESTLE_CONNECTION,
      label: 'Trestle',
      origin: 'https://api.trestleiq.com',
      methods: ['GET'],
      headers: { 'x-api-key': env.TRESTLE_API_KEY.trim() },
    });
  if (env.PDL_API_KEY?.trim())
    connections.push({
      id: PDL_PEOPLE_CONNECTION,
      label: 'People Data Labs person enrichment',
      origin: 'https://api.peopledatalabs.com',
      methods: ['GET'],
      headers: { 'X-API-Key': env.PDL_API_KEY.trim() },
      requestDelayMs: 650,
    });
  if (env.CONTACTOUT_API_KEY?.trim())
    connections.push({
      id: CONTACTOUT_CONNECTION,
      label: 'ContactOut',
      origin: 'https://api.contactout.com',
      methods: ['GET'],
      headers: { token: env.CONTACTOUT_API_KEY.trim() },
    });
  if (env.UPCELL_API_KEY?.trim())
    connections.push({
      id: UPCELL_CONNECTION,
      label: 'Upcell',
      origin: 'https://api.upcell.io',
      methods: ['POST'],
      headers: { Authorization: env.UPCELL_API_KEY.trim() },
    });
  if (env.BOUNCEBAN_API_KEY?.trim())
    connections.push({
      id: BOUNCEBAN_CONNECTION,
      label: 'BounceBan',
      origin: 'https://api-waterfall.bounceban.com',
      methods: ['GET'],
      headers: { Authorization: env.BOUNCEBAN_API_KEY.trim() },
      requestTimeoutMs: 35_000,
    });
  return connections;
}
