// A disposable Worker + D1 exercise. Uses synthetic identities and no external APIs.
// Run after npm run build:hosted. No browser automation or live data is involved.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: 'pomade-accounts-test',
    modules: [
      'index.js',
      ...readdirSync('dist-hosted/dist/server', { recursive: true }).filter(
        (f) => /\.m?js$/.test(f) && f !== 'index.js',
      ),
    ].map((f) => ({ type: 'ESModule', path: 'dist-hosted/dist/server/' + f })),
    modulesRoot: 'dist-hosted/dist/server',
    compatibilityDate: '2026-09-03',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'],
    bindings: {
      POMADE_DEPLOYMENT: 'hosted',
      POMADE_ACCOUNTS_ENABLED: 'true',
      POMADE_OWNER_EMAIL: 'owner@example.test',
      POMADE_PUBLIC_ORIGIN: 'http://localhost',
      POMADE_VAULT_KEY: btoa('0123456789abcdef0123456789abcdef'),
      APOLLO_API_KEY: 'synthetic-owner-key',
      HUBSPOT_ACCESS_TOKEN: 'synthetic-owner-crm',
    },
  }),
);
async function api(
  who,
  path,
  body,
  method = body ? 'POST' : 'GET',
  expected = 200,
) {
  const response = await mf.dispatchFetch('http://localhost' + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'oai-authenticated-user-id': 'test-' + who,
      'oai-authenticated-user-email': who + '@example.test',
      origin: 'http://localhost',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    expected,
    `${who} ${path}: ${JSON.stringify(result)}`,
  );
  assert.match(response.headers.get('cache-control'), /no-store/);
  return result;
}
try {
  const db = await mf.getD1Database('DB');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    for (const sql of readFileSync('drizzle/' + file, 'utf8')
      .split('--> statement-breakpoint')
      .filter((s) => s.trim()))
      await db.prepare(sql).run();
  }
  const owner = await api('owner', '/api/account');
  assert.equal(owner.account.role, 'owner');
  const ownerTables = await api('owner', '/api/tables');
  assert.ok(ownerTables.tables.length);
  const evidence = {
    id: 'synthetic-performance',
    workspaceId: ownerTables.tables[0].id,
    status: 'completed',
    startedAt: 1,
    finishedAt: 2,
    rowCount: 1,
    actionCount: 1,
    passedCount: 1,
    reviewCount: 0,
    externalWrites: 0,
    receipts: [
      {
        id: 'one',
        rowId: 'row',
        rowLabel: 'Synthetic',
        columnId: 'email',
        action: 'Lookup',
        status: 'passed',
        before: '',
        after: 'synthetic@example.test',
        durationMs: 1,
        provider: 'http',
        providerConnectionId: 'synthetic',
        providerLabel: 'Synthetic',
        operationId: 'job:row:email:0',
        operationRole: 'lookup',
        outcome: 'accepted',
        httpRequestCount: 1,
      },
    ],
  };
  await db
    .prepare(
      "INSERT INTO runs(id,workspace_id,status,row_count,action_count,receipt,created_at) VALUES (?,?,'completed',1,1,?,?)",
    )
    .bind(
      evidence.id,
      evidence.workspaceId,
      JSON.stringify(evidence),
      Date.now(),
    )
    .run();
  assert.equal(
    (
      await api(
        'owner',
        '/api/providers/performance?workspaceId=' + evidence.workspaceId,
      )
    ).providers[0].accepted,
    1,
  );
  const members = [];
  for (let i = 1; i <= 3; i++) {
    const who = 'friend' + i;
    members.push(
      (
        await api('owner', '/api/account', {
          action: 'invite',
          email: who + '@example.test',
        })
      ).account,
    );
    const [settings] = await Promise.all([
      api(who, '/api/account'),
      api(who, '/api/tables'),
      api(who, '/api/providers/apollo'),
    ]);
    assert.ok(settings.connections.every((c) => !c.configured));
    assert.deepEqual(
      (
        await api(
          who,
          '/api/providers/performance?workspaceId=' + evidence.workspaceId,
        )
      ).providers,
      [],
    );
    assert.equal(settings.members, undefined);
    const tables = await api(who, '/api/tables');
    assert.equal(tables.tables.length, 1);
    assert.equal(tables.tables[0].rowCount, 0);
    const created = await api(
      who,
      '/api/tables',
      { name: 'Private ' + who, mode: 'empty' },
      'POST',
      201,
    );
    members[i - 1].table = created.table.id;
  }
  // These route handlers import env separately from the Worker. Concurrent calls
  // prove the actual runtime carries the correct scoped DB and keys across await.
  await Promise.all(
    Array.from({ length: 12 }, async (_, i) => {
      const who = 'friend' + ((i % 3) + 1),
        own = members[i % 3];
      const tables = await api(who, '/api/tables');
      assert.deepEqual(
        tables.tables
          .filter((t) => t.id !== 'founder-targets')
          .map((t) => t.id),
        [own.table],
      );
      const provider = await api(who, '/api/providers/apollo');
      assert.equal(provider.configured, false);
      const crm = await api(who, '/api/providers/crm');
      assert.equal(crm.providers.hubspot.configured, false);
    }),
  );
  assert.equal((await api('owner', '/api/providers/apollo')).configured, true);
  await api(
    'friend2',
    '/api/workspace?workspaceId=' + members[0].table,
    undefined,
    'GET',
    404,
  );
  await api(
    'friend2',
    '/api/account',
    { action: 'revoke', accountId: members[0].id },
    'POST',
    403,
  );
  await api('friend1', '/api/account', {
    action: 'save',
    provider: 'apollo',
    values: { APOLLO_API_KEY: 'synthetic-friend-key' },
  });
  assert.equal(
    (await api('friend1', '/api/providers/apollo')).configured,
    true,
  );
  assert.equal(
    (await api('friend2', '/api/providers/apollo')).configured,
    false,
  );
  await api('friend1', '/api/account', {
    action: 'disconnect',
    provider: 'apollo',
  });
  assert.equal(
    (await api('friend1', '/api/providers/apollo')).configured,
    false,
  );
  await api('owner', '/api/account', {
    action: 'revoke',
    accountId: members[0].id,
  });
  await api('friend1', '/api/tables', undefined, 'GET', 403);
  assert.ok(
    (await api('friend2', '/api/tables')).tables.some(
      (t) => t.id === members[1].table,
    ),
  );
  // Hosted background polls also route through the member's private database.
  await api('friend2', '/api/jobs?workspaceId=' + members[1].table);
  assert.deepEqual(
    (await api('friend3', '/api/jobs?workspaceId=' + members[1].table)).jobs,
    [],
  );
  console.log(
    'PASS: real Worker routes, owner + three friends, concurrent isolation, empty onboarding, key separation, tampered table IDs, owner-only administration, disconnect, revocation.',
  );
} finally {
  await mf.dispose();
}
