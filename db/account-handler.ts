import {
  CONNECTIONS,
  connectionDefinition,
  connectionValues,
} from '@/lib/account-connections';
import { sealCredentials } from '@/lib/credential-vault';
import { validApolloCallback } from '@/lib/apollo-phone';
import { checkManagedApolloCallback } from '@/lib/apollo-callback';
import { readCrmSource } from '@/lib/crm-sources';
import { salesforceRenewalEnvironment } from '@/lib/salesforce-auth';
import { versionedWorkspaceStatements } from './workspace-store';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
import {
  accountEnvironment,
  AccountError,
  inviteAccount,
  publicAccount,
  type PomadeAccount,
} from './accounts';

export async function handleAccount(
  request: Request,
  env: Cloudflare.Env,
  account: PomadeAccount,
) {
  if (request.method === 'GET') {
    const saved = await env.DB.prepare(
      'SELECT provider,label,updated_at FROM account_credentials WHERE account_id=?',
    )
      .bind(account.id)
      .all<{ provider: string; label: string; updated_at: number }>();
    const members =
      account.role === 'owner'
        ? (
            await env.DB.prepare(
              'SELECT * FROM pomade_accounts ORDER BY created_at',
            ).all<PomadeAccount>()
          ).results.map(publicAccount)
        : undefined;
    return Response.json({
      enabled: true,
      account: publicAccount(account),
      members,
      connections: CONNECTIONS.filter((c) => !c.hidden).map((c) => {
        const connection = saved.results.find((s) => s.provider === c.id);
        return {
          ...c,
          configured: !!connection,
          ...(c.id === 'apollo'
            ? {
                managedCallbackConfigured: validApolloCallback(
                  env.POMADE_APOLLO_CALLBACK_URL?.trim(),
                ),
              }
            : {}),
          label: connection?.label,
          updatedAt: connection?.updated_at,
        };
      }),
    });
  }
  if (request.method !== 'POST')
    throw new AccountError('Use GET or POST.', 405);
  const raw = await request.text();
  if (raw.length > 64000)
    throw new AccountError('Connection details are too large.', 413);
  let body: {
    action?: string;
    email?: string;
    accountId?: string;
    provider?: string;
    values?: unknown;
    label?: string;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AccountError('Enter valid account details.');
  }
  if (!body || typeof body !== 'object')
    throw new AccountError('Enter valid account details.');
  if (body.action === 'invite' || body.action === 'revoke') {
    if (account.role !== 'owner')
      throw new AccountError(
        'Only the site owner can manage invitations.',
        403,
      );
    if (body.action === 'invite')
      return Response.json({
        account: publicAccount(await inviteAccount(env.DB, body.email)),
        message:
          'Account allowed in Pomade. Also add this email to the private site’s visitor list to let them open the website.',
      });
    if (typeof body.accountId !== 'string' || body.accountId === account.id)
      throw new AccountError('Choose a friend’s account.');
    const result = await env.DB.prepare(
      "UPDATE pomade_accounts SET status='disabled',companion_hash=NULL WHERE id=? AND role='member'",
    )
      .bind(body.accountId)
      .run();
    if (!result.meta.changes) throw new AccountError('Account not found.', 404);
    return Response.json({
      message:
        'Access revoked. New requests and background runs are blocked; a request already in progress may finish.',
    });
  }
  const provider = body.provider ?? '';
  try {
    connectionDefinition(provider);
  } catch {
    throw new AccountError('Choose a supported connection.');
  }
  if (body.action === 'test_callback' && provider === 'apollo') {
    try {
      return Response.json({ message: await checkManagedApolloCallback(env) });
    } catch {
      throw new AccountError(
        'The Pomade callback could not receive a test delivery. Check the callback service and installation settings; no Apollo lookup was submitted.',
        502,
      );
    }
  }
  if (!['save', 'disconnect', 'test'].includes(body.action ?? ''))
    throw new AccountError('Choose a connection action.');
  const scoped = await accountEnvironment(env, account);
  if (body.action === 'test') {
    if (provider !== 'hubspot' && provider !== 'salesforce')
      throw new AccountError(
        'Connection testing is available for HubSpot and Salesforce.',
      );
    try {
      const preview = await readCrmSource(provider, 1, {
        objectType: provider === 'hubspot' ? 'company' : 'account',
        hubSpotAccessToken: scoped.HUBSPOT_ACCESS_TOKEN,
        salesforceAccessToken: scoped.SALESFORCE_ACCESS_TOKEN,
        salesforceInstanceUrl: scoped.SALESFORCE_INSTANCE_URL,
        ...salesforceRenewalEnvironment(scoped),
      });
      return Response.json({
        message: `${provider === 'hubspot' ? 'HubSpot' : 'Salesforce'} connection works. Read ${preview.contacts.length} company record; no CRM data changed.`,
      });
    } catch {
      throw new AccountError(
        'The CRM connection could not read companies. Check the token, account URL, and read permissions.',
        502,
      );
    }
  }
  const now = Date.now();
  const active = await scoped.DB.prepare(
    "SELECT id FROM run_jobs WHERE status='running' AND lease_until>? UNION ALL SELECT id FROM crm_sync_runs WHERE status='running' UNION ALL SELECT workspace_id FROM crm_refreshes WHERE status='running' AND lease_until>? LIMIT 1",
  )
    .bind(now, now)
    .first();
  if (active)
    throw new AccountError(
      'Let the current run finish before changing a connection.',
      409,
    );
  const changes: D1PreparedStatement[] = [];
  if (body.action === 'save') {
    let values: Record<string, string>;
    try {
      values = connectionValues(provider, body.values);
    } catch (error) {
      throw new AccountError(
        error instanceof Error
          ? error.message
          : 'Check the connection details.',
      );
    }
    const label =
      typeof body.label === 'string' ? body.label.trim().slice(0, 100) : '';
    changes.push(
      env.DB.prepare(
        'INSERT INTO account_credentials(account_id,provider,payload,label,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(account_id,provider) DO UPDATE SET payload=excluded.payload,label=excluded.label,updated_at=excluded.updated_at',
      ).bind(
        account.id,
        provider,
        await sealCredentials(
          env.POMADE_VAULT_KEY!,
          account.id,
          provider,
          values,
        ),
        label || 'My account',
        now,
      ),
    );
  } else
    changes.push(
      env.DB.prepare(
        'DELETE FROM account_credentials WHERE account_id=? AND provider=?',
      ).bind(account.id, provider),
    );
  // Run this separate scoped batch before changing the credential. It cannot
  // accidentally send a saved CRM preview to a replacement CRM account.
  const cleanup = [scoped.DB.prepare('DELETE FROM provider_cache')];
  if (provider === 'hubspot' || provider === 'salesforce') {
    cleanup.push(
      scoped.DB.prepare(
        "DELETE FROM crm_sync_runs WHERE provider=? AND status='preview'",
      ).bind(provider),
    );
    cleanup.push(
      scoped.DB.prepare(
        "UPDATE crm_refreshes SET status='paused',next_run_at=NULL WHERE json_extract(state,'$.source.provider')=?",
      ).bind(provider),
    );
    cleanup.push(
      scoped.DB.prepare(
        "UPDATE workbook_runs SET status='cancelled',lease_until=NULL WHERE status IN ('running','paused','needs_attention')",
      ),
    );
    cleanup.push(
      scoped.DB.prepare(
        "UPDATE run_jobs SET status='cancelled',lease_until=NULL WHERE status IN ('queued','running','paused')",
      ),
    );
    const workspaces = await scoped.DB.prepare(
      'SELECT snapshot FROM workspaces',
    ).all<{ snapshot: string }>();
    for (const record of workspaces.results) {
      const workspace = JSON.parse(record.snapshot) as WorkspaceSnapshot;
      if (workspace.schedule?.enabled) {
        workspace.schedule.enabled = false;
        workspace.revision = (workspace.revision ?? 0) + 1;
        workspace.updatedAt = now;
        cleanup.push(
          ...(await versionedWorkspaceStatements(
            scoped.DB,
            workspace,
            'Grid edit',
            now,
          )),
        );
      }
    }
  }
  await scoped.DB.batch(cleanup);
  await env.DB.batch(changes);
  return Response.json({
    message:
      body.action === 'save'
        ? 'Connection saved. Keys stay private. Reload your table to use the updated connection.'
        : 'Connection disconnected. Reload your table to update available providers.',
  });
}
