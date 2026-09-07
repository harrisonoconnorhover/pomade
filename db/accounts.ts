import { accountDatabase } from '@/lib/account-database';
import { CONNECTIONS, PRIVATE_ENV_KEYS } from '@/lib/account-connections';
import { openCredentials, sealCredentials } from '@/lib/credential-vault';
import { sha256 } from '@/lib/deployment';
import { ensureDatabaseSchema } from './ensure';

export type PomadeAccount = {
  id: string;
  email: string;
  subject: string | null;
  role: 'owner' | 'member';
  status: 'invited' | 'active' | 'disabled';
  data_prefix: string;
  schema_version: number;
  vault_migrated: number;
  companion_hash: string | null;
  created_at: number;
};
export const ACCOUNT_SCHEMA_VERSION = 2;
export const accountsEnabled = (env: Cloudflare.Env) =>
  env.POMADE_DEPLOYMENT === 'hosted' && env.POMADE_ACCOUNTS_ENABLED === 'true';
export class AccountError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function publicAccount(a: PomadeAccount) {
  return {
    id: a.id,
    email: a.email,
    role: a.role,
    status: a.status,
    createdAt: a.created_at,
  };
}
export async function initializeAccounts(env: Cloudflare.Env) {
  if (!env.POMADE_VAULT_KEY || !env.POMADE_OWNER_EMAIL)
    throw new AccountError('Account storage is not configured.', 503);
  const ownerEmail = env.POMADE_OWNER_EMAIL.trim().toLowerCase();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO pomade_accounts(id,email,role,status,data_prefix,created_at) VALUES ('owner',?,'owner','active','',?)",
  )
    .bind(ownerEmail, Date.now())
    .run();
  const owner = (await env.DB.prepare(
    "SELECT * FROM pomade_accounts WHERE id='owner'",
  ).first<PomadeAccount>())!;
  if (!owner.vault_migrated) {
    const entries: D1PreparedStatement[] = [];
    for (const definition of CONNECTIONS) {
      const values = Object.fromEntries(
        definition.fields.flatMap((f) => {
          const value = env[f.key as keyof Cloudflare.Env];
          return typeof value === 'string' && value ? [[f.key, value]] : [];
        }),
      );
      if (Object.keys(values).length)
        entries.push(
          env.DB.prepare(
            "INSERT OR IGNORE INTO account_credentials(account_id,provider,payload,label,updated_at) SELECT ?,?,?,?,? WHERE (SELECT vault_migrated FROM pomade_accounts WHERE id='owner')=0",
          ).bind(
            'owner',
            definition.id,
            await sealCredentials(
              env.POMADE_VAULT_KEY,
              'owner',
              definition.id,
              values,
            ),
            'Existing connection',
            Date.now(),
          ),
        );
    }
    entries.push(
      env.DB.prepare(
        "UPDATE pomade_accounts SET vault_migrated=1,companion_hash=? WHERE id='owner' AND vault_migrated=0",
      ).bind(env.POMADE_COMPANION_TOKEN_SHA256 ?? null),
    );
    await env.DB.batch(entries);
  }
}
export async function resolveAccount(request: Request, env: Cloudflare.Env) {
  const origin = request.headers.get('origin');
  if (!env.POMADE_PUBLIC_ORIGIN)
    throw new AccountError('Hosted access is not configured.', 503);
  if (origin && origin !== env.POMADE_PUBLIC_ORIGIN)
    throw new AccountError('Cross-origin requests are not allowed.', 403);
  await initializeAccounts(env);
  let account: PomadeAccount | null = null;
  if (new URL(request.url).pathname === '/api/companion') {
    const token = /^Bearer ([A-Za-z0-9_-]{40,160})$/.exec(
      request.headers.get('authorization') ?? '',
    )?.[1];
    if (origin || !token)
      throw new AccountError('Invalid companion connection.', 401);
    account = await env.DB.prepare(
      "SELECT * FROM pomade_accounts WHERE companion_hash=? AND status='active'",
    )
      .bind(await sha256(token))
      .first<PomadeAccount>();
  } else {
    const token = request.headers.get('x-pomade-owner-key');
    const ownerAutomation =
      token &&
      /^[A-Za-z0-9_-]{40,160}$/.test(token) &&
      env.POMADE_OWNER_TOKEN_SHA256 &&
      (await sha256(token)) === env.POMADE_OWNER_TOKEN_SHA256;
    if (ownerAutomation)
      account = await env.DB.prepare(
        "SELECT * FROM pomade_accounts WHERE id='owner'",
      ).first<PomadeAccount>();
    else {
      // These headers are trusted only behind the private Sites dispatcher.
      const subject = request.headers.get('oai-authenticated-user-id')?.trim();
      const email = request.headers
        .get('oai-authenticated-user-email')
        ?.trim()
        .toLowerCase();
      if (!subject || !email)
        throw new AccountError('Sign in to your invited Pomade account.', 401);
      account = await env.DB.prepare(
        'SELECT * FROM pomade_accounts WHERE subject=?',
      )
        .bind(subject)
        .first<PomadeAccount>();
      if (!account) {
        account = await env.DB.prepare(
          'SELECT * FROM pomade_accounts WHERE email=?',
        )
          .bind(email)
          .first<PomadeAccount>();
        if (account?.subject && account.subject !== subject)
          throw new AccountError(
            'This invitation belongs to a different sign-in.',
            403,
          );
        if (account && account.status !== 'disabled') {
          await env.DB.prepare(
            "UPDATE pomade_accounts SET subject=?,status='active' WHERE id=? AND subject IS NULL AND status!='disabled'",
          )
            .bind(subject, account.id)
            .run();
          account = await env.DB.prepare(
            'SELECT * FROM pomade_accounts WHERE id=?',
          )
            .bind(account.id)
            .first<PomadeAccount>();
          if (account?.subject !== subject)
            throw new AccountError(
              'This invitation has already been accepted.',
              403,
            );
        }
      }
    }
  }
  if (!account || account.status !== 'active')
    throw new AccountError(
      'This account does not have access to Pomade. Contact the site owner.',
      403,
    );
  return account;
}
export async function accountEnvironment(
  env: Cloudflare.Env,
  account: PomadeAccount,
): Promise<Cloudflare.Env> {
  const db = accountDatabase(env.DB, account.data_prefix);
  if (account.data_prefix && account.schema_version < ACCOUNT_SCHEMA_VERSION) {
    await ensureDatabaseSchema(db);
    await env.DB.prepare(
      'UPDATE pomade_accounts SET schema_version=? WHERE id=?',
    )
      .bind(ACCOUNT_SCHEMA_VERSION, account.id)
      .run();
  }
  const scoped = {
    ...env,
    DB: db,
    POMADE_ACCOUNT_ID: account.id,
  } as Cloudflare.Env;
  for (const key of PRIVATE_ENV_KEYS)
    (scoped as unknown as Record<string, unknown>)[key] = undefined;
  scoped.POMADE_OWNER_TOKEN_SHA256 = undefined;
  scoped.POMADE_VAULT_KEY = undefined;
  if (account.role !== 'owner') scoped.POMADE_SCHEDULES_ENABLED = 'false';
  const saved = await env.DB.prepare(
    'SELECT provider,payload FROM account_credentials WHERE account_id=?',
  )
    .bind(account.id)
    .all<{ provider: string; payload: string }>();
  for (const row of saved.results) {
    const fields = CONNECTIONS.find((c) => c.id === row.provider)?.fields;
    if (!fields) continue;
    const values = await openCredentials(
      env.POMADE_VAULT_KEY!,
      account.id,
      row.provider,
      row.payload,
    );
    for (const field of fields)
      if (values[field.key])
        (scoped as unknown as Record<string, unknown>)[field.key] =
          values[field.key];
  }
  return scoped;
}
export async function inviteAccount(db: D1Database, emailInput: unknown) {
  const email =
    typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AccountError('Enter a valid email address.');
  const existing = await db
    .prepare('SELECT * FROM pomade_accounts WHERE email=?')
    .bind(email)
    .first<PomadeAccount>();
  if (
    existing?.role === 'owner' ||
    (existing && existing.status !== 'disabled')
  )
    return existing;
  const id = crypto.randomUUID();
  // One atomic statement enforces the three-member beta limit under concurrency.
  const result = existing
    ? await db
        .prepare(
          "UPDATE pomade_accounts SET status=CASE WHEN subject IS NULL THEN 'invited' ELSE 'active' END WHERE id=? AND (SELECT COUNT(*) FROM pomade_accounts WHERE role='member' AND status!='disabled')<3",
        )
        .bind(existing.id)
        .run()
    : await db
        .prepare(
          "INSERT INTO pomade_accounts(id,email,role,status,data_prefix,created_at) SELECT ?,?,'member','invited',?,? WHERE (SELECT COUNT(*) FROM pomade_accounts WHERE role='member' AND status!='disabled')<3",
        )
        .bind(id, email, `member_${id.replaceAll('-', '')}_`, Date.now())
        .run();
  if (!result.meta.changes)
    throw new AccountError(
      'This beta has room for three invited friends.',
      409,
    );
  return (await db
    .prepare('SELECT * FROM pomade_accounts WHERE email=?')
    .bind(email)
    .first<PomadeAccount>())!;
}
