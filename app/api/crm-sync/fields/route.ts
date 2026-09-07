import { salesforceRenewalEnvironment } from '@/lib/salesforce-auth';
import { env } from 'cloudflare:workers';
import { CrmSyncClient, type CrmSyncConfig } from '@/lib/crm-sync';
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const config = {
      provider: query.get('provider'),
      objectType: query.get('objectType'),
      mapping: {},
    } as CrmSyncConfig;
    const client = new CrmSyncClient(config, {
      hubSpotAccessToken: env.HUBSPOT_ACCESS_TOKEN,
      salesforceAccessToken: env.SALESFORCE_ACCESS_TOKEN,
      ...salesforceRenewalEnvironment(env),
      salesforceInstanceUrl: env.SALESFORCE_INSTANCE_URL,
      salesforceApiVersion: env.SALESFORCE_API_VERSION,
    });
    return Response.json({ fields: await client.fields() });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'CRM fields could not be loaded.',
      },
      { status: 400 },
    );
  }
}
