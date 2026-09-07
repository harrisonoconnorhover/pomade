// Real Worker + persistent disposable D1. All outbound traffic is intercepted;
// synthetic contacts and keys only. Run after npm run build:hosted.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const stateDir = mkdtempSync(join(tmpdir(), 'pomade-enrow-worker-'));
const calls = [];
let resultChecks = 0;
const options = {
  name: 'pomade-enrow-test',
  modules: ['index.js', ...readdirSync('dist-hosted/dist/server', { recursive: true })
    .filter(f => /\.m?js$/.test(f) && f !== 'index.js')]
    .map(f => ({ type: 'ESModule', path: 'dist-hosted/dist/server/' + f })),
  modulesRoot: 'dist-hosted/dist/server',
  compatibilityDate: '2026-09-03',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: ['DB'], resourcePersistencePath: stateDir,
  bindings: {
    ENROW_API_KEY: 'synthetic-key',
    POMADE_HTTP_CONNECTIONS: JSON.stringify({
      fixture: { origin: 'https://fixture.test', methods: ['GET'], headers: {} },
    }),
  },
  outboundService: async request => {
    const url = new URL(request.url);
    calls.push(request.method + ' ' + url.hostname + url.pathname);
    if (url.hostname === 'fixture.test') {
      if (url.pathname === '/before') return Response.json({ value: 'Earlier action completed' });
      if (url.pathname === '/first') return Response.json({ email: '', status: 'invalid' });
      if (url.pathname === '/last') return Response.json({ email: 'ada@example.test', status: 'valid' });
      if (url.pathname === '/after') {
        assert.equal(url.searchParams.get('email'), 'ada@example.test');
        return Response.json({ value: 'Downstream received accepted email' });
      }
    }
    if (url.hostname === 'api.enrow.io' && url.pathname === '/email/find/single') {
      assert.equal(request.headers.get('x-api-key'), 'synthetic-key');
      if (request.method === 'POST') {
        assert.deepEqual(await request.json(), { fullname: 'Ada Example', company_domain: 'example.test' });
        return Response.json({ id: 'saved-search-1', credits_used: 1 });
      }
      assert.equal(url.searchParams.get('id'), 'saved-search-1');
      return ++resultChecks === 1
        ? Response.json({ qualification: 'ongoing' }, { status: 202 })
        : Response.json({ qualification: 'invalid' });
    }
    throw new Error('Unexpected outbound request blocked: ' + request.url);
  },
};
let mf = new Miniflare(convertV4MiniflareOptions(options));
async function api(path, body, method = body ? 'POST' : 'GET', expected = 200) {
  const response = await mf.dispatchFetch('http://localhost' + path, {
    method, headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
const tick = async () => { await (await mf.getWorker()).scheduled({ scheduledTime: Date.now(), cron: '* * * * *' }); };
async function allowPoll(db) {
  await db.prepare("UPDATE waterfall_progress SET state=json_set(state,'$.requests.1.nextPollAt',0)").run();
}
try {
  let db = await mf.getD1Database('DB');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort())
    for (const sql of readFileSync('drizzle/' + file, 'utf8').split('--> statement-breakpoint').filter(s => s.trim()))
      await db.prepare(sql).run();
  const created = await api('/api/tables', { name: 'Synthetic async run', mode: 'empty' }, 'POST', 201);
  const id = created.table.id;
  const { workspace: w } = await api('/api/workspace?workspaceId=' + id);
  const httpColumn = (id, path) => ({
    id, title: id, kind: 'enrichment', recipe: 'http-api', width: 180,
    http: { connectionId: 'fixture', method: 'GET', pathTemplate: path,
      outputs: [{ path: 'value', outputColumnId: id }], statusColumnId: id + '_status' },
  });
  const step = path => ({ connectionId: 'fixture', method: 'GET', pathTemplate: path,
    responsePath: 'email', verification: { path: 'status', acceptedValues: ['valid'] } });
  w.columns = ['company', 'person', 'domain'].map(id => ({ id, title: id, kind: 'text', width: 180 }));
  w.columns.push(httpColumn('before', '/before'), {
    id: 'email', title: 'Email waterfall', kind: 'enrichment', recipe: 'http-waterfall', width: 180,
    providerWaterfall: {
      steps: [step('/first'), { connectionId: 'pomade_enrow', method: 'POST',
        pathTemplate: '/email/find/single', bodyTemplate: JSON.stringify({ fullname: '{{person}}', company_domain: '{{domain}}' }),
        responsePath: 'email', verification: { path: 'qualification', acceptedValues: ['valid'] } }, step('/last')],
      accept: 'verified-email', continueOnError: false, winnerColumnId: 'provider', statusColumnId: 'email_status',
    },
  }, httpColumn('after', '/after?email={{email}}'));
  w.rows = [{ id: 'row', values: { company: 'Example', person: 'Ada Example', domain: 'example.test' } }];
  await api('/api/workspace?workspaceId=' + id, { workspace: w }, 'PUT');
  const stored = (await api('/api/workspace?workspaceId=' + id)).workspace;
  await api('/api/runs', { workspace: stored, rowIds: ['row'], confirmExternalResearch: true }, 'POST', 409);
  assert.equal(calls.length, 0);
  const { job } = await api('/api/jobs', { workspace: stored, rowIds: ['row'], confirmExternalResearch: true }, 'POST', 201);
  await tick();
  let progress = await db.prepare('SELECT status,cursor,resume_column_ids FROM run_jobs WHERE id=?').bind(job.id).first();
  assert.equal(progress.status, 'queued');
  assert.equal(progress.cursor, 0);
  assert.deepEqual(JSON.parse(progress.resume_column_ids), ['email', 'after']);
  assert.deepEqual(calls, ['GET fixture.test/before', 'GET fixture.test/first', 'POST api.enrow.io/email/find/single']);
  assert.match((await db.prepare('SELECT state FROM waterfall_progress').first()).state, /saved-search-1/);
  await api('/api/jobs', { action: 'pause', jobId: job.id }, 'PATCH');
  await tick();
  assert.equal(calls.length, 3);
  await mf.dispose();
  mf = new Miniflare(convertV4MiniflareOptions(options));
  db = await mf.getD1Database('DB');
  await api('/api/jobs', { action: 'resume', jobId: job.id }, 'PATCH');
  await allowPoll(db); await tick();
  assert.equal(resultChecks, 1);
  assert.equal(calls.length, 4);
  await allowPoll(db); await tick();
  progress = await db.prepare('SELECT status,cursor FROM run_jobs WHERE id=?').bind(job.id).first();
  assert.equal(progress.status, 'completed');
  assert.equal(progress.cursor, 1);
  const final = (await api('/api/workspace?workspaceId=' + id)).workspace.rows[0].values;
  assert.equal(final.email, 'ada@example.test');
  assert.equal(final.after, 'Downstream received accepted email');
  assert.equal(final.before, 'Earlier action completed');
  assert.deepEqual(calls, [
    'GET fixture.test/before', 'GET fixture.test/first', 'POST api.enrow.io/email/find/single',
    'GET api.enrow.io/email/find/single', 'GET api.enrow.io/email/find/single',
    'GET fixture.test/last', 'GET fixture.test/after',
  ]);
  console.log('PASS: real Worker/D1, immediate-run refusal, queued submit, pending pipeline, pause, process restart, saved-ID polling, prior-step reuse, completed-miss fallback and downstream execution. No live network requests.');
} finally {
  await mf.dispose();
  rmSync(stateDir, { recursive: true, force: true });
}
