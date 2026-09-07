import { salesforceRenewalEnvironment } from '@/lib/salesforce-auth';
import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/ensure';
import {
  previewCrmSync,
  executeCrmAction,
  CrmSyncClient,
  type CrmSyncConfig,
  type CrmSyncPlan,
} from '@/lib/crm-sync';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
const options = () => ({
  hubSpotAccessToken: env.HUBSPOT_ACCESS_TOKEN,
  salesforceAccessToken: env.SALESFORCE_ACCESS_TOKEN,
  ...salesforceRenewalEnvironment(env),
  salesforceInstanceUrl: env.SALESFORCE_INSTANCE_URL,
  salesforceApiVersion: env.SALESFORCE_API_VERSION,
});
export async function GET(request: Request) {
  const db = await ensureDatabase(),
    id = new URL(request.url).searchParams.get('workspaceId');
  const records = await db
    .prepare(
      'SELECT plan FROM crm_sync_runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 10',
    )
    .bind(id)
    .all<{ plan: string }>();
  return Response.json({
    plans: records.results.map((r) => JSON.parse(r.plan)),
  });
}
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      rowIds?: string[];
      config?: CrmSyncConfig;
      planId?: string;
      confirmWrite?: boolean;
    };
    const db = await ensureDatabase();
    if (!body.planId) {
      const stored = await db
        .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
        .bind(body.workspaceId)
        .first<{ snapshot: string }>();
      if (!stored || !body.config || !Array.isArray(body.rowIds))
        return Response.json(
          { error: 'Choose a saved table, rows and CRM mapping.' },
          { status: 400 },
        );
      const plan = await previewCrmSync(
        JSON.parse(stored.snapshot),
        body.rowIds,
        body.config,
        options(),
      );
      await db
        .prepare(
          'INSERT INTO crm_sync_runs (id,workspace_id,provider,status,plan,created_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          plan.id,
          plan.workspaceId,
          plan.config.provider,
          plan.status,
          JSON.stringify(plan),
          plan.createdAt,
        )
        .run();
      return Response.json({ plan });
    }
    const record = await db
      .prepare('SELECT plan FROM crm_sync_runs WHERE id = ?')
      .bind(body.planId)
      .first<{ plan: string }>();
    if (!record)
      return Response.json({ error: 'Preview not found.' }, { status: 404 });
    const plan = JSON.parse(record.plan) as CrmSyncPlan;
    if (plan.status !== 'preview') return Response.json({ plan });
    if (!body.confirmWrite)
      return Response.json(
        { error: 'Review the preview and confirm the CRM write.' },
        { status: 400 },
      );
    const stored = await db
      .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
      .bind(plan.workspaceId)
      .first<{ snapshot: string }>();
    const workspace = stored
      ? (JSON.parse(stored.snapshot) as WorkspaceSnapshot)
      : undefined;
    if (!workspace || (workspace.revision || 0) !== plan.revision)
      return Response.json(
        { error: 'The table changed after preview; preview again.' },
        { status: 409 },
      );
    if (plan.actions.some((a) => a.action === 'review'))
      return Response.json(
        { error: 'Resolve rows needing review before writing.' },
        { status: 409 },
      );
    // One local CRM batch at a time, including across different preview IDs.
    const claim = await db
      .prepare(
        `UPDATE crm_sync_runs SET status='running' WHERE id=? AND status='preview' AND NOT EXISTS (SELECT 1 FROM crm_sync_runs WHERE status='running')`,
      )
      .bind(plan.id)
      .run();
    if (!claim.meta.changes)
      return Response.json(
        {
          error:
            'A CRM write is already running. Check its receipts before retrying.',
        },
        { status: 409 },
      );
    plan.status = 'running';
    const persist = async () => {
      await db
        .prepare('UPDATE crm_sync_runs SET status=?, plan=? WHERE id=?')
        .bind(plan.status, JSON.stringify(plan), plan.id)
        .run();
    };
    await persist();
    const client = new CrmSyncClient(plan.config, options());
    for (let i = 0; i < plan.actions.length; i++) {
      plan.actions[i] = await executeCrmAction(plan.actions[i], client);
      await persist();
      if (plan.actions[i].status === 'uncertain') break;
    }
    plan.status = plan.actions.every((a) => a.status === 'verified')
      ? 'complete'
      : 'review';
    await persist();
    return Response.json({ plan });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'CRM operation failed.',
      },
      { status: 502 },
    );
  }
}
