import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
vi.mock('cloudflare:workers', () => ({ env: {} }));
import {
  ACCOUNT_TABLES,
  accountDatabase,
  accountSql,
} from './account-database';
import { sealCredentials, openCredentials } from './credential-vault';
import { connectionValues, PRIVATE_ENV_KEYS } from './account-connections';
import {
  accountEnvironment,
  initializeAccounts,
  inviteAccount,
  resolveAccount,
} from '../db/accounts';
import { handleAccount } from '../db/account-handler';
import { sha256 } from './deployment';
import { ensureDatabaseSchema } from '../db/ensure';
const open: DatabaseSync[] = [];
function database() {
  const sql = new DatabaseSync(':memory:');
  open.push(sql);
  for (const file of readdirSync(new URL('../drizzle', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sql.exec(
      readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'),
    );
  const db = {
    prepare(query: string) {
      function bound(args: unknown[]) {
        return {
          bind: (...next: unknown[]) => bound(next),
          first: async () =>
            sql.prepare(query).get(...(args as never[])) ?? null,
          all: async () => ({
            results: sql.prepare(query).all(...(args as never[])),
          }),
          run: async () => ({
            meta: {
              changes: Number(
                sql.prepare(query).run(...(args as never[])).changes,
              ),
            },
          }),
        };
      }
      return bound([]);
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const stmt of statements) results.push(await stmt.run());
        sql.exec('COMMIT');
        return results;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { db, sql };
}
const master = btoa('0123456789abcdef0123456789abcdef');
function environment(db: D1Database): Cloudflare.Env {
  return {
    DB: db,
    POMADE_DEPLOYMENT: 'hosted',
    POMADE_ACCOUNTS_ENABLED: 'true',
    POMADE_OWNER_EMAIL: 'owner@example.test',
    POMADE_PUBLIC_ORIGIN: 'https://pomade.example',
    POMADE_VAULT_KEY: master,
    APOLLO_API_KEY: 'owner-apollo',
    HUBSPOT_ACCESS_TOKEN: 'owner-hubspot',
    POMADE_COMPANION_TOKEN_SHA256: 'owner-companion',
  };
}
function request(
  email: string,
  subject = email,
  body?: unknown,
  pathname = '/api/account',
) {
  return new Request('https://pomade.example' + pathname, {
    method: body ? 'POST' : 'GET',
    headers: {
      'oai-authenticated-user-email': email,
      'oai-authenticated-user-id': subject,
      origin: 'https://pomade.example',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
afterEach(() => {
  for (const db of open.splice(0)) db.close();
  vi.restoreAllMocks();
});
describe('private accounts', () => {
  it('keeps the owner data and migrates credentials once without reappearing after disconnect', async () => {
    const { db, sql } = database(),
      env = environment(db);
    sql
      .prepare('INSERT INTO workspaces VALUES (?,?,?,?,?)')
      .run('owned', 'Owner', '{"revision":0}', 1, 1);
    const owner = await resolveAccount(request('owner@example.test'), env);
    const scoped = await accountEnvironment(env, owner);
    expect(
      await scoped.DB.prepare('SELECT name FROM workspaces').first(),
    ).toMatchObject({ name: 'Owner' });
    expect(scoped.APOLLO_API_KEY).toBe('owner-apollo');
    const stored = await db
      .prepare('SELECT payload FROM account_credentials')
      .all();
    expect(JSON.stringify(stored)).not.toContain('owner-apollo');
    await handleAccount(
      request('owner@example.test', 'owner@example.test', {
        action: 'disconnect',
        provider: 'apollo',
      }),
      env,
      owner,
    );
    await initializeAccounts(env);
    expect(
      (await accountEnvironment(env, owner)).APOLLO_API_KEY,
    ).toBeUndefined();
  });
  it('binds an invitation to its first stable sign-in and rejects uninvited and revoked users', async () => {
    const { db } = database(),
      env = environment(db);
    await initializeAccounts(env);
    await expect(
      resolveAccount(request('stranger@example.test'), env),
    ).rejects.toMatchObject({ status: 403 });
    const invited = await inviteAccount(db, 'Friend@Example.test');
    const friend = await resolveAccount(
      request('friend@example.test', 'subject-one'),
      env,
    );
    expect(friend.id).toBe(invited.id);
    expect(friend.status).toBe('active');
    await expect(
      resolveAccount(request('friend@example.test', 'subject-two'), env),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await resolveAccount(
          request('new-email@example.test', 'subject-one'),
          env,
        )
      ).id,
    ).toBe(friend.id);
    const owner = await resolveAccount(request('owner@example.test'), env);
    await handleAccount(
      request(owner.email, owner.email, {
        action: 'revoke',
        accountId: friend.id,
      }),
      env,
      owner,
    );
    await expect(
      resolveAccount(request('friend@example.test', 'subject-one'), env),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('never accepts an account ID as authentication, and rejects missing identity and foreign origins', async () => {
    const { db } = database(),
      env = environment(db);
    await expect(
      resolveAccount(
        new Request('https://pomade.example/api/account?accountId=owner'),
        env,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      resolveAccount(
        new Request('https://pomade.example/api/account', {
          headers: { origin: 'https://evil.test' },
        }),
        env,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('limits invitations to three friends and reserves administration for the owner', async () => {
    const { db } = database(),
      env = environment(db);
    await initializeAccounts(env);
    for (let i = 0; i < 3; i++)
      await inviteAccount(db, `friend${i}@example.test`);
    await expect(inviteAccount(db, 'four@example.test')).rejects.toMatchObject({
      status: 409,
    });
    const friend = await resolveAccount(request('friend0@example.test'), env);
    await expect(
      handleAccount(
        request(friend.email, friend.email, {
          action: 'revoke',
          accountId: 'owner',
        }),
        env,
        friend,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        (await (
          await handleAccount(request(friend.email), env, friend)
        ).json()) as { members?: unknown }
      ).members,
    ).toBeUndefined();
  });
  it.each([
    ['leadmagic', 'LEADMAGIC_API_KEY'],
    ['findymail', 'FINDYMAIL_API_KEY'],
    ['zerobounce', 'ZEROBOUNCE_API_KEY'],
    ['trestle', 'TRESTLE_API_KEY'],
    ['contactout', 'CONTACTOUT_API_KEY'],
    ['upcell', 'UPCELL_API_KEY'],
    ['bounceban', 'BOUNCEBAN_API_KEY'],
    ['enrow', 'ENROW_API_KEY'],
    ['fullenrich', 'FULLENRICH_API_KEY'],
  ])(
    'isolates %s through save and disconnect without owner fallback',
    async (provider, key) => {
      const { db } = database(),
        env = environment(db);
      Object.assign(env, { [key]: 'owner-fixture-secret' });
      await initializeAccounts(env);
      const a = await inviteAccount(db, 'leadmagic-a@example.test');
      const b = await inviteAccount(db, 'leadmagic-b@example.test');
      expect(
        (await accountEnvironment(env, a))[key as keyof Cloudflare.Env],
      ).toBeUndefined();
      const saved = await handleAccount(
        request(a.email, a.email, {
          action: 'save',
          provider,
          values: { [key]: 'member-fixture-secret' },
        }),
        env,
        a,
      );
      expect(saved.status).toBe(200);
      expect(await saved.text()).not.toContain('member-fixture-secret');
      expect(
        (await accountEnvironment(env, a))[key as keyof Cloudflare.Env],
      ).toBe('member-fixture-secret');
      expect(
        (await accountEnvironment(env, b))[key as keyof Cloudflare.Env],
      ).toBeUndefined();
      const disconnected = await handleAccount(
        request(a.email, a.email, {
          action: 'disconnect',
          provider,
        }),
        env,
        a,
      );
      expect(disconnected.status).toBe(200);
      expect(
        (await accountEnvironment(env, a))[key as keyof Cloudflare.Env],
      ).toBeUndefined();
    },
  );
  it('isolates every data table, including identical IDs, caches, settings, research, jobs, and CRM plans', async () => {
    const { db, sql } = database(),
      env = environment(db);
    await initializeAccounts(env);
    const scopes = [];
    for (let i = 0; i < 3; i++) {
      const member = await inviteAccount(db, `friend${i}@example.test`);
      const scoped = await accountEnvironment(env, member);
      scopes.push(scoped);
      await scoped.DB.prepare('INSERT INTO workspaces VALUES (?,?,?,?,?)')
        .bind('same', 'Friend ' + i, '{"revision":0}', 1, 1)
        .run();
      await scoped.DB.prepare('INSERT INTO provider_cache VALUES (?,?,?,?,?)')
        .bind('same', 'test', 'private ' + i, 1, 9)
        .run();
      await scoped.DB.prepare('INSERT INTO research_settings VALUES (1,?)')
        .bind('settings ' + i)
        .run();
      await scoped.DB.prepare(
        'INSERT INTO research_requests(id,prompt,status,created_at,updated_at) VALUES (?,?,?,?,?)',
      )
        .bind('same', 'prompt ' + i, 'queued', 1, 1)
        .run();
      await scoped.DB.prepare(
        'INSERT INTO run_jobs(id,workspace_id,status,row_ids,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      )
        .bind('same', 'same', 'queued', '[]', 1, 1)
        .run();
      await scoped.DB.prepare(
        'INSERT INTO waterfall_progress VALUES (?,?,?,?,?,?)',
      )
        .bind('same', 'same', 'same-job', 'inputs', 'private-search-' + i, 1)
        .run();
      await scoped.DB.prepare('INSERT INTO crm_sync_runs VALUES (?,?,?,?,?,?)')
        .bind('same', 'same', 'hubspot', 'preview', 'private ' + i, 1)
        .run();
      for (const name of ACCOUNT_TABLES)
        expect(
          sql
            .prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?')
            .get('table', member.data_prefix + name),
        ).toBeTruthy();
      for (const key of PRIVATE_ENV_KEYS)
        expect(scoped[key as keyof Cloudflare.Env]).toBeUndefined();
    }
    for (let i = 0; i < 3; i++) {
      expect(
        await scopes[i].DB.prepare('SELECT name FROM workspaces WHERE id=?')
          .bind('same')
          .first(),
      ).toMatchObject({ name: 'Friend ' + i });
      expect(
        await scopes[i].DB.prepare(
          'SELECT payload FROM provider_cache',
        ).first(),
      ).toMatchObject({ payload: 'private ' + i });
      expect(
        await scopes[i].DB.prepare(
          'SELECT prompt FROM research_requests',
        ).first(),
      ).toMatchObject({ prompt: 'prompt ' + i });
      expect(
        await scopes[i].DB.prepare(
          'SELECT state FROM waterfall_progress',
        ).first(),
      ).toMatchObject({ state: 'private-search-' + i });
      expect(
        await scopes[i].DB.prepare('SELECT plan FROM crm_sync_runs').first(),
      ).toMatchObject({ plan: 'private ' + i });
    }
    await scopes[0].DB.prepare(
      "UPDATE run_jobs SET status='cancelled' WHERE id='same'",
    ).run();
    expect(
      await scopes[1].DB.prepare('SELECT status FROM run_jobs').first(),
    ).toMatchObject({ status: 'queued' });
    expect(await db.prepare('SELECT * FROM workspaces').first()).toBeNull();
  });
  it('keeps schemas aligned with all migrated data tables and columns', async () => {
    const { db, sql } = database(),
      prefix = 'member_' + 'a'.repeat(32) + '_';
    await ensureDatabaseSchema(accountDatabase(db, prefix));
    const baseline = (
      sql
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]
    )
      .map((t) => t.name)
      .filter(
        (t) =>
          !t.startsWith('member_') &&
          !['pomade_accounts', 'account_credentials'].includes(t),
      );
    expect([...ACCOUNT_TABLES].sort()).toEqual(baseline.sort());
    for (const table of ACCOUNT_TABLES) {
      const cols = (name: string) =>
        sql
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map((c) => String(c.name))
          .sort();
      expect(cols(prefix + table), table).toEqual(cols(table));
    }
  });
  it('clears cached provider results and keeps private keys out of account responses', async () => {
    const { db } = database(),
      env = environment(db);
    await initializeAccounts(env);
    await inviteAccount(db, 'a@example.test');
    const a = await resolveAccount(request('a@example.test'), env);
    await handleAccount(
      request(a.email, a.email, {
        action: 'save',
        provider: 'apollo',
        values: {
          APOLLO_API_KEY: 'friend-secret',
          HUBSPOT_ACCESS_TOKEN: 'injected',
        },
      }),
      env,
      a,
    );
    const scoped = await accountEnvironment(env, a);
    expect(scoped.APOLLO_API_KEY).toBe('friend-secret');
    expect(scoped.HUBSPOT_ACCESS_TOKEN).toBeUndefined();
    const response = await handleAccount(request(a.email), env, a);
    expect(await response.text()).not.toContain('friend-secret');
    const owner = await resolveAccount(request('owner@example.test'), env);
    expect((await accountEnvironment(env, owner)).APOLLO_API_KEY).toBe(
      'owner-apollo',
    );
  });
  it('CRM replacement clears its previews and pauses saved work without changing another account', async () => {
    const { db } = database(),
      env = environment(db);
    await initializeAccounts(env);
    const a = await inviteAccount(db, 'a@example.test'),
      b = await inviteAccount(db, 'b@example.test');
    for (const member of [a, b]) {
      const scoped = await accountEnvironment(env, member);
      await scoped.DB.prepare('INSERT INTO workspaces VALUES (?,?,?,?,?)')
        .bind('same', 'CRM', '{"revision":0}', 1, 1)
        .run();
      await scoped.DB.prepare('INSERT INTO crm_sync_runs VALUES (?,?,?,?,?,?)')
        .bind('plan', 'same', 'hubspot', 'preview', '{}', 1)
        .run();
      await scoped.DB.prepare('INSERT INTO crm_refreshes VALUES (?,?,?,?,?,?)')
        .bind('same', '{"source":{"provider":"hubspot"}}', 'idle', 100, null, 1)
        .run();
      await scoped.DB.prepare(
        'INSERT INTO workbook_runs VALUES (?,?,?,?,?,?,?)',
      )
        .bind('run', 'book', 'running', '{}', null, 1, 1)
        .run();
      await scoped.DB.prepare(
        'INSERT INTO run_jobs(id,workspace_id,status,row_ids,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      )
        .bind('job', 'same', 'queued', '[]', 1, 1)
        .run();
    }
    await handleAccount(
      request(a.email, a.email, {
        action: 'save',
        provider: 'hubspot',
        values: { HUBSPOT_ACCESS_TOKEN: 'new-crm' },
      }),
      env,
      a,
    );
    const one = await accountEnvironment(env, a),
      two = await accountEnvironment(env, b);
    expect(
      await one.DB.prepare('SELECT * FROM crm_sync_runs').first(),
    ).toBeNull();
    expect(
      await two.DB.prepare('SELECT * FROM crm_sync_runs').first(),
    ).not.toBeNull();
    expect(
      await one.DB.prepare('SELECT status FROM crm_refreshes').first(),
    ).toMatchObject({ status: 'paused' });
    expect(
      await one.DB.prepare('SELECT status FROM run_jobs').first(),
    ).toMatchObject({ status: 'cancelled' });
    expect(
      await two.DB.prepare('SELECT status FROM run_jobs').first(),
    ).toMatchObject({ status: 'queued' });
  });
  it('keeps companion authentication scoped and rejects the owner token for member selection', async () => {
    const { db } = database(),
      env = environment(db),
      token = 'a'.repeat(48);
    env.POMADE_COMPANION_TOKEN_SHA256 = await sha256(token);
    const companion = await resolveAccount(
      new Request(
        'https://pomade.example/api/companion?accountId=someone-else',
        { headers: { authorization: 'Bearer ' + token } },
      ),
      env,
    );
    expect(companion.id).toBe('owner');
    await expect(
      resolveAccount(
        new Request('https://pomade.example/api/companion', {
          headers: { authorization: 'Bearer ' + 'b'.repeat(48) },
        }),
        env,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
describe('connection encryption and database boundaries', () => {
  it('uses fresh authenticated encryption and rejects ciphertext or account substitution', async () => {
    const first = await sealCredentials(master, 'a', 'apollo', {
        key: 'secret',
      }),
      second = await sealCredentials(master, 'a', 'apollo', { key: 'secret' });
    expect(first).not.toBe(second);
    expect(first).not.toContain('secret');
    expect(await openCredentials(master, 'a', 'apollo', first)).toEqual({
      key: 'secret',
    });
    await expect(openCredentials(master, 'b', 'apollo', first)).rejects.toThrow(
      'unlocked',
    );
    await expect(openCredentials(master, 'a', 'hunter', first)).rejects.toThrow(
      'unlocked',
    );
    await expect(
      openCredentials(master, 'a', 'apollo', first.slice(0, -8) + 'AAAAAAAA'),
    ).rejects.toThrow('unlocked');
  });
  it('renames quoted identifiers without touching JSON, comments or string values; blocks global metadata and mixed batches', async () => {
    const { db } = database(),
      prefix = 'member_' + 'b'.repeat(32) + '_',
      scoped = accountDatabase(db, prefix);
    expect(
      accountSql(
        'SELECT \'workspaces\', "workspaces".snapshot FROM `workspaces` -- workspaces',
        prefix,
      ),
    ).toBe(
      `SELECT 'workspaces', "${prefix}workspaces".snapshot FROM \`${prefix}workspaces\` -- workspaces`,
    );
    for (const sql of [
      'SELECT * FROM pomade_accounts',
      'SELECT * FROM "account_credentials"',
      'SELECT * FROM sqlite_master',
      'SELECT * FROM member_foo_workspaces',
    ])
      expect(() => scoped.prepare(sql)).toThrow('denied');
    expect(() =>
      scoped.batch([db.prepare('SELECT * FROM workspaces')]),
    ).toThrow('Mixed');
  });
  it('rejects Salesforce credential forwarding to other hosts and missing renewal client IDs', () => {
    expect(() =>
      connectionValues('salesforce', {
        SALESFORCE_INSTANCE_URL: 'https://salesforce.com.evil.test',
        SALESFORCE_ACCESS_TOKEN: 'token',
      }),
    ).toThrow('Salesforce HTTPS');
    expect(() =>
      connectionValues('salesforce', {
        SALESFORCE_INSTANCE_URL: 'https://example.my.salesforce.com',
        SALESFORCE_ACCESS_TOKEN: 'token',
        SALESFORCE_REFRESH_TOKEN: 'refresh',
      }),
    ).toThrow('client ID');
  });
});
