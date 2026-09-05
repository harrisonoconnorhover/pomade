import { env } from 'cloudflare:workers';

import { readCrmSource } from '@/lib/crm-sources';
import type { CrmProvider, CrmObjectType } from '@/lib/pomade-types';

function configuredProviders() {
  return {
    hubspot: {
      configured: Boolean(env.HUBSPOT_ACCESS_TOKEN?.trim()),
      label: 'HubSpot',
      mode: 'read_only' as const,
    },
    salesforce: {
      configured: Boolean(
        env.SALESFORCE_INSTANCE_URL?.trim() &&
        env.SALESFORCE_ACCESS_TOKEN?.trim(),
      ),
      label: 'Salesforce',
      mode: 'read_only' as const,
    },
  };
}

function isProvider(value: unknown): value is CrmProvider {
  return value === 'hubspot' || value === 'salesforce';
}

export async function GET() {
  return Response.json({ providers: configuredProviders() });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const provider = (body as { provider?: unknown })?.provider;
    const requestedLimit = (body as { limit?: unknown })?.limit;
    if (!isProvider(provider)) {
      return Response.json(
        { error: 'Choose HubSpot or Salesforce.' },
        { status: 400 },
      );
    }
    const limit =
      typeof requestedLimit === 'number' && Number.isFinite(requestedLimit)
        ? requestedLimit
        : 50;
    const status = configuredProviders()[provider];
    if (!status.configured) {
      return Response.json(
        { error: `${status.label} is not configured.` },
        { status: 503 },
      );
    }

    const preview = await readCrmSource(provider, limit, {
      objectType: (body as { objectType?: CrmObjectType }).objectType,
      fields: (body as { fields?: string[] }).fields,
      recordIds: (body as { recordIds?: string[] }).recordIds,
      hubSpotAccessToken: env.HUBSPOT_ACCESS_TOKEN,
      salesforceInstanceUrl: env.SALESFORCE_INSTANCE_URL,
      salesforceAccessToken: env.SALESFORCE_ACCESS_TOKEN,
      salesforceApiVersion: env.SALESFORCE_API_VERSION,
    });
    return Response.json({ preview });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'The CRM source could not be read.';
    return Response.json({ error: message }, { status: 502 });
  }
}
