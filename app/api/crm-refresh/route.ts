import { salesforceRenewalEnvironment } from '@/lib/salesforce-auth';
import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/ensure';
import {
  getCrmRefresh,
  configureCrmRefresh,
  refreshCrmWorkspace,
  crmWorkspace,
} from '@/db/crm-refresh';
import { readSavedCrmSource, type CrmRefreshState } from '@/lib/crm-refresh';
import { reviewCrmImport } from '@/lib/crm-import';
function options() {
  return {
    hubSpotAccessToken: env.HUBSPOT_ACCESS_TOKEN,
    salesforceAccessToken: env.SALESFORCE_ACCESS_TOKEN,
    ...salesforceRenewalEnvironment(env),
    salesforceInstanceUrl: env.SALESFORCE_INSTANCE_URL,
    salesforceApiVersion: env.SALESFORCE_API_VERSION,
  };
}
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('workspaceId');
  if (!id) return Response.json({ error: 'Choose a sheet.' }, { status: 400 });
  return Response.json({
    state: await getCrmRefresh(await ensureDatabase(), id),
  });
}
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId: string;
      action: string;
      cadence: CrmRefreshState['cadence'];
      maxRecords?: number;
    };
    if (typeof body.workspaceId !== 'string')
      throw new Error('Choose a saved source sheet.');
    const db = await ensureDatabase();
    if (body.action === 'configure')
      return Response.json({
        state: await configureCrmRefresh(
          db,
          body.workspaceId,
          body.cadence,
          body.maxRecords ?? 500,
        ),
      });
    if (body.action === 'preview') {
      const workspace = await crmWorkspace(db, body.workspaceId);
      const preview = await readSavedCrmSource(
        workspace,
        body.maxRecords ?? 500,
        options(),
      );
      return Response.json({
        preview,
        review: reviewCrmImport(workspace, preview),
      });
    }
    if (body.action !== 'refresh')
      throw new Error('Choose preview, refresh, or configure.');
    return Response.json(
      await refreshCrmWorkspace(
        db,
        body.workspaceId,
        options(),
        body.maxRecords,
      ),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'CRM refresh failed.' },
      { status: 409 },
    );
  }
}
