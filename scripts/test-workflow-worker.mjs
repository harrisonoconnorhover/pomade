// Compiled Worker and persistent disposable D1. Every external request is mocked.
// Run after npm run build:hosted; no live provider/CRM calls or browser automation.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const stateDir = mkdtempSync(join(tmpdir(), 'pomade-workflow-worker-'));
const calls = [];
let checks = 0,
  submissions = 0,
  crmProperties;
const options = {
  name: 'pomade-workflow-test',
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
  resourcePersistencePath: stateDir,
  bindings: {
    ENROW_API_KEY: 'synthetic-key',
    HUBSPOT_ACCESS_TOKEN: 'synthetic-crm',
    POMADE_HTTP_CONNECTIONS: JSON.stringify({
      fixture: { origin: 'https://fixture.test', methods: ['GET'] },
    }),
  },
  outboundService: async (request) => {
    const url = new URL(request.url);
    calls.push(request.method + ' ' + url.hostname + url.pathname);
    if (url.hostname === 'fixture.test') {
      if (url.pathname === '/source')
        return Response.json({
          data: [{ id: 'one', company: 'Example', domain: 'example.test' }],
        });
      if (url.pathname === '/before')
        return Response.json({ value: 'Completed before lookup' });
      if (url.pathname === '/first')
        return Response.json({ email: 'candidate@example.test' });
      if (url.pathname === '/last')
        return Response.json({
          email: 'accepted@example.test',
          status: 'valid',
        });
      if (url.pathname === '/after') {
        assert.equal(url.searchParams.get('email'), 'accepted@example.test');
        return Response.json({ value: 'Ready for CRM' });
      }
    }
    if (
      url.hostname === 'api.enrow.io' &&
      url.pathname === '/email/verify/single'
    ) {
      assert.equal(request.headers.get('x-api-key'), 'synthetic-key');
      if (request.method === 'POST') {
        submissions++;
        assert.deepEqual(await request.json(), {
          email: 'candidate@example.test',
        });
        return Response.json({
          id: 'verification-' + submissions,
          credits_used: 0.25,
        });
      }
      assert.equal(url.searchParams.get('id'), 'verification-1');
      checks++;
      return checks === 1
        ? Response.json({ qualification: 'ongoing' }, { status: 202 })
        : Response.json({
            email: 'candidate@example.test',
            qualification: 'invalid',
          });
    }
    if (url.hostname === 'api.hubapi.com') {
      assert.equal(
        request.headers.get('authorization'),
        'Bearer synthetic-crm',
      );
      assert.equal(
        checks,
        2,
        'CRM must wait for final verification and fallback',
      );
      if (url.pathname === '/crm/v3/objects/companies/search')
        return Response.json({ results: [] });
      if (
        url.pathname === '/crm/v3/objects/companies' &&
        request.method === 'POST'
      ) {
        crmProperties = (await request.json()).properties;
        assert.deepEqual(crmProperties, {
          name: 'Example',
          domain: 'example.test',
          description: 'accepted@example.test',
        });
        return Response.json({ id: '123' });
      }
      if (url.pathname === '/crm/v3/objects/companies/123')
        return Response.json({ properties: crmProperties });
    }
    throw new Error(
      'Unexpected outbound request blocked: ' + url.origin + url.pathname,
    );
  },
};
let mf = new Miniflare(convertV4MiniflareOptions(options));
async function api(path, body, method = body ? 'POST' : 'GET', expected = 200) {
  const response = await mf.dispatchFetch('http://localhost' + path, {
    method,
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
const tick = async () => {
  await (
    await mf.getWorker()
  ).scheduled({ scheduledTime: Date.now(), cron: '* * * * *' });
};
const table = async (name) =>
  (await api('/api/tables', { name, mode: 'empty' }, 'POST', 201)).table.id;
const load = async (id) =>
  (await api('/api/workspace?workspaceId=' + id)).workspace;
const save = async (w) =>
  (await api('/api/workspace?workspaceId=' + w.id, { workspace: w }, 'PUT'))
    .workspace;
try {
  let db = await mf.getD1Database('DB');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of readFileSync('drizzle/' + file, 'utf8')
      .split('--> statement-breakpoint')
      .filter((s) => s.trim()))
      await db.prepare(sql).run();
  const targetId = await table('Synthetic destination'),
    id = await table('Synthetic scheduled research');
  const dest = await load(targetId);
  dest.columns.push({ id: 'email', title: 'Email', kind: 'text', width: 180 });
  await save(dest);
  let w = await load(id);
  const column = (id, path) => ({
    id,
    title: id,
    kind: 'enrichment',
    recipe: 'http-api',
    width: 180,
    http: {
      connectionId: 'fixture',
      method: 'GET',
      pathTemplate: path,
      outputs: [{ path: 'value', outputColumnId: id }],
      statusColumnId: id + '_status',
    },
  });
  const first = {
    connectionId: 'fixture',
    method: 'GET',
    pathTemplate: '/first',
    responsePath: 'email',
    verifier: { presetId: 'enrow-verify' },
  };
  w.columns.push(
    column('before', '/before'),
    {
      id: 'email',
      title: 'Email waterfall',
      kind: 'enrichment',
      recipe: 'http-waterfall',
      width: 180,
      providerWaterfall: {
        steps: [
          first,
          {
            connectionId: 'fixture',
            method: 'GET',
            pathTemplate: '/last',
            responsePath: 'email',
            verification: { path: 'status', acceptedValues: ['valid'] },
          },
        ],
        accept: 'verified-email',
        continueOnError: false,
        winnerColumnId: 'winner',
        statusColumnId: 'email_status',
      },
    },
    column('after', '/after?email={{email}}'),
  );
  w.schedule = {
    id: 'schedule',
    cadence: 'once',
    enabled: true,
    state: 'active',
    target: 'all',
    nextRunAt: Date.now() - 1,
    confirmExternalResearch: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    beforeRunSource: {
      config: {
        connectionId: 'fixture',
        method: 'GET',
        path: '/source',
        recordsPath: 'data',
        identityPath: 'id',
        pagination: 'none',
        parameter: '',
        start: 0,
        pageSize: 1,
        cursorPath: '',
        maxPages: 1,
        maxRows: 1,
      },
      mapping: { company: 'company', domain: 'domain' },
    },
    afterRunTransfers: [
      {
        id: 'transfer',
        name: 'Accepted contacts',
        targetTableId: targetId,
        sourceKey: 'domain',
        targetKey: 'domain',
        normalization: 'domain',
        mode: 'upsert',
        skipBlank: true,
        mapping: { company: 'company', email: 'email' },
      },
    ],
    afterRunCrm: [
      {
        mappingId: 'crm',
        name: 'Test HubSpot',
        config: {
          provider: 'hubspot',
          objectType: 'company',
          mapping: { name: 'company', domain: 'domain', description: 'email' },
        },
      },
    ],
  };
  await save(w);
  await tick();
  w = await load(id);
  const jobId = w.schedule.jobId;
  assert.ok(jobId);
  assert.equal(w.schedule.state, 'running');
  assert.equal(submissions, 1);
  assert.deepEqual(calls, [
    'GET fixture.test/source',
    'GET fixture.test/before',
    'GET fixture.test/first',
    'POST api.enrow.io/email/verify/single',
  ]);
  let job = (await api('/api/jobs?workspaceId=' + id)).jobs[0];
  assert.equal(job.id, jobId);
  assert.ok(job.waitingMessage);
  assert.ok(job.nextCheckAt > Date.now());
  assert.equal(job.lastError, undefined);
  assert.equal((await load(targetId)).rows.length, 0);
  const waiting = await api('/api/providers/performance?workspaceId=' + id);
  assert.equal(
    waiting.providers.find((p) => p.connectionId === 'pomade_enrow').waiting,
    1,
  );
  await api('/api/jobs', { jobId, action: 'pause' }, 'PATCH');
  await tick();
  assert.equal((await load(id)).schedule.state, 'paused');
  assert.equal(calls.length, 4);
  await mf.dispose();
  mf = new Miniflare(convertV4MiniflareOptions(options));
  db = await mf.getD1Database('DB');
  await api('/api/jobs', { jobId, action: 'resume' }, 'PATCH');
  await tick();
  assert.equal(checks, 0);
  async function poll() {
    await db
      .prepare(
        "UPDATE waterfall_progress SET state=json_set(state,'$.requests.v0.nextPollAt',0)",
      )
      .run();
    await db.prepare('UPDATE run_jobs SET next_check_at=0').run();
    await tick();
  }
  await poll();
  assert.equal(checks, 1);
  assert.equal((await load(targetId)).rows.length, 0);
  assert.equal(crmProperties, undefined);
  await poll();
  assert.equal(checks, 2);
  assert.equal(submissions, 1);
  job = (await api('/api/jobs?workspaceId=' + id)).jobs[0];
  assert.equal(job.status, 'completed');
  assert.equal(job.waitingMessage, undefined);
  assert.equal(job.nextCheckAt, undefined);
  assert.equal((await load(id)).rows[0].values.after, 'Ready for CRM');
  await db
    .prepare(
      "INSERT INTO run_jobs(id,workspace_id,status,row_ids,created_at,updated_at) VALUES ('busy-destination',?,'paused','[]',?,?)",
    )
    .bind(targetId, Date.now(), Date.now())
    .run();
  await tick();
  assert.equal((await load(id)).schedule.state, 'failed');
  assert.match((await load(id)).schedule.lastError, /destination has active/);
  assert.equal((await load(targetId)).rows.length, 0);
  await db.prepare("DELETE FROM run_jobs WHERE id='busy-destination'").run();
  await api('/api/jobs', { jobId, action: 'resume' }, 'PATCH');
  assert.equal(
    (await api('/api/jobs?workspaceId=' + id)).jobs[0].status,
    'completed',
  );
  await tick();
  const finished = (await load(id)).schedule;
  assert.equal(finished.state, 'complete', JSON.stringify(finished));
  assert.equal(
    (await load(targetId)).rows[0].values.email,
    'accepted@example.test',
  );
  assert.equal(
    calls.filter((c) => c === 'POST api.hubapi.com/crm/v3/objects/companies')
      .length,
    1,
  );
  await tick();
  assert.equal(calls.filter((c) => c === 'GET fixture.test/source').length, 1);
  assert.equal(calls.filter((c) => c === 'GET fixture.test/before').length, 1);
  const performance = await api('/api/providers/performance?workspaceId=' + id);
  assert.equal(
    performance.providers.find((p) => p.connectionId === 'fixture')
      .fallbackMatches,
    1,
  );
  assert.equal(
    performance.providers.find((p) => p.connectionId === 'fixture').lookups,
    2,
  );
  const verifier = performance.providers.find(
    (p) => p.connectionId === 'pomade_enrow',
  );
  assert.equal(verifier.verifications, 1);
  assert.equal(verifier.resultChecks, 2);
  assert.equal(verifier.observedCredits, 0.25);
  assert.equal(verifier.waiting, 0);
  const fresh = await load(id);
  const { job: cancelled } = await api(
    '/api/jobs',
    {
      workspace: fresh,
      rowIds: fresh.rows.map((r) => r.id),
      columnIds: ['email'],
      confirmExternalResearch: true,
    },
    'POST',
    201,
  );
  await api('/api/jobs', { jobId: cancelled.id, action: 'cancel' }, 'PATCH');
  await api(
    '/api/jobs',
    { jobId: cancelled.id, action: 'resume' },
    'PATCH',
    409,
  );
  await tick();
  assert.equal(submissions, 1);
  const latest = await load(id);
  await api(
    '/api/jobs',
    {
      workspace: latest,
      rowIds: latest.rows.map((r) => r.id),
      columnIds: ['email'],
      confirmExternalResearch: true,
    },
    'POST',
    201,
  );
  await tick();
  assert.equal(submissions, 2, 'An explicitly new run starts a fresh lookup');
  console.log(
    'PASS: scheduled source → finder → async verifier → fallback → downstream → HubSpot write/readback → table transfer. Pause/restart/resume preserves saved work, performance deduplicates polling, cancellation stops work, and a new run submits afresh. All external traffic intercepted.',
  );
} finally {
  await mf.dispose();
  rmSync(stateDir, { recursive: true, force: true });
}
