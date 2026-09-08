import { afterEach, describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createWorkbookRun, workbookBatch } from './workbook-run';
import {
  startWorkbookRun,
  runWorkbooks,
  readWorkbookRun,
  controlWorkbookRun,
  workbookJobAllowed,
} from '../db/workbook-runner';
import {
  configureCrmRefresh,
  refreshCrmWorkspace,
  getCrmRefresh,
} from '../db/crm-refresh';
import { createTable } from './workbook';
import type { WorkspaceSnapshot } from './pomade-types';
const databases: DatabaseSync[] = [];
function database() {
  const sql = new DatabaseSync(':memory:');
  databases.push(sql);
  for (const path of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sql.exec(
      readFileSync(new URL(`../drizzle/${path}`, import.meta.url), 'utf8'),
    );
  const db = {
    prepare(query: string) {
      const stmt = sql.prepare(query);
      function bound(args: unknown[]) {
        return {
          bind: (...next: unknown[]) => bound(next),
          first: async () => stmt.get(...(args as never[])) ?? null,
          all: async () => ({ results: stmt.all(...(args as never[])) }),
          run: async () => ({
            meta: { changes: Number(stmt.run(...(args as never[])).changes) },
          }),
        };
      }
      return bound([]);
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sql.exec('BEGIN');
      try {
        const values = [];
        for (const s of statements) values.push(await s.run());
        sql.exec('COMMIT');
        return values;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { db, sql };
}
function tables() {
  const a = createTable({ id: 'first', name: 'Request', mode: 'empty' }),
    b = createTable({ id: 'second', name: 'Accounts', mode: 'empty' });
  a.rows = [
    { id: 'request', values: { company: 'Example', domain: 'example.com' } },
  ];
  a.columns.push({
    id: 'research',
    title: 'Find companies',
    kind: 'enrichment',
    width: 200,
    recipe: 'web-research',
    prompt: 'Find {{company}}',
    outputCardinality: 'list',
  });
  b.columns.push({
    id: 'name',
    title: 'First name',
    kind: 'formula',
    width: 120,
    recipe: 'first-name',
  });
  b.rows = [
    { id: 'unrelated', values: { company: 'Other', domain: 'other.test' } },
  ];
  a.tableTransfers = [
    {
      id: 'route',
      name: 'Route companies',
      targetTableId: b.id,
      sourceKey: 'domain',
      targetKey: 'domain',
      mode: 'upsert',
      normalization: 'domain',
      skipBlank: true,
      mapping: { company: 'company' },
      rowScope: 'children',
      childRecipeId: 'research',
    },
  ];
  const guide = {
    id: 'book',
    fingerprint: 'test',
    name: 'Test workbook',
    request: 'Test',
    summary: 'Test',
    purpose: 'Test',
    assumptions: [],
    manualTasks: [],
    tables: [
      { id: a.id, name: a.name },
      { id: b.id, name: b.name },
    ],
    steps: [
      { tableId: a.id, columnId: 'research', title: 'Find', detail: '' },
      { tableId: a.id, transferId: 'route', title: 'Route', detail: '' },
      { tableId: b.id, columnId: 'name', title: 'Name', detail: '' },
    ],
  };
  a.workbookPlan = guide;
  b.workbookPlan = guide;
  return [a, b];
}
function save(sql: DatabaseSync, workspace: WorkspaceSnapshot) {
  const previous = sql
    .prepare('SELECT snapshot FROM workspaces WHERE id=?')
    .get(workspace.id);
  if (previous)
    workspace.revision =
      (JSON.parse(String(previous.snapshot)).revision ?? 0) + 1;
  sql
    .prepare(
      'INSERT INTO workspaces(id,name,snapshot,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot',
    )
    .run(workspace.id, workspace.name, JSON.stringify(workspace), 1, 1);
}
afterEach(() => databases.splice(0).forEach((d) => d.close()));
describe('durable workbook execution', () => {
  it('queues each step once, routes child rows, and scopes subsequent steps to matching destination rows', async () => {
    const { db, sql } = database(),
      [a, b] = tables();
    save(sql, a);
    save(sql, b);
    await startWorkbookRun(db, a.id, {});
    await runWorkbooks(db);
    await runWorkbooks(db);
    expect(sql.prepare('SELECT count(*) AS n FROM run_jobs').get()?.n).toBe(1);
    a.rows.push({
      id: 'found',
      parentRowId: 'request',
      generatedByColumnId: 'research',
      values: { company: 'Example', domain: 'example.com' },
    });
    save(sql, a);
    sql.exec("UPDATE run_jobs SET status='completed',completed_count=1");
    await runWorkbooks(db);
    await runWorkbooks(db);
    await runWorkbooks(db);
    const run = (await readWorkbookRun(db, 'book'))!;
    expect(run.steps[0].status).toBe('completed');
    expect(run.steps[1].status).toBe('completed');
    expect(run.scope.second).toHaveLength(1);
    expect(run.scope.second).not.toContain('unrelated');
    const target = JSON.parse(
      String(
        sql.prepare("SELECT snapshot FROM workspaces WHERE id='second'").get()
          ?.snapshot,
      ),
    );
    expect(target.rows).toHaveLength(2);
    expect(
      sql.prepare('SELECT count(*) AS n FROM table_transfer_runs').get()?.n,
    ).toBe(1);
    sql.exec("UPDATE run_jobs SET status='completed',completed_count=1");
    await runWorkbooks(db);
    await runWorkbooks(db);
    expect((await readWorkbookRun(db, 'book'))?.status).toBe('completed');
  });
  it('keeps an in-flight row lease when resuming and does not allow cancelled workbook jobs', async () => {
    const { db, sql } = database(),
      [a, b] = tables();
    save(sql, a);
    save(sql, b);
    const run = await startWorkbookRun(db, a.id, {});
    await runWorkbooks(db);
    const lease = Date.now() + 20000;
    sql
      .prepare("UPDATE run_jobs SET status='running',lease_until=?")
      .run(lease);
    await controlWorkbookRun(db, run.id, 'pause');
    expect(await workbookJobAllowed(db, run.id, a)).toBe(false);
    await controlWorkbookRun(db, run.id, 'resume');
    expect(
      sql.prepare('SELECT status,lease_until FROM run_jobs').get(),
    ).toMatchObject({ status: 'running', lease_until: lease });
    await controlWorkbookRun(db, run.id, 'cancel');
    expect(await workbookJobAllowed(db, run.id, a)).toBe(false);
    expect(sql.prepare('SELECT status FROM run_jobs').get()?.status).toBe(
      'cancelled',
    );
  });
  it('stops changed steps and duplicate runs before additional provider work', async () => {
    const { db, sql } = database(),
      [a, b] = tables();
    save(sql, a);
    save(sql, b);
    await startWorkbookRun(db, a.id, {});
    await expect(startWorkbookRun(db, a.id, {})).rejects.toThrow();
    a.columns.find((c) => c.id === 'research')!.prompt = 'Changed';
    save(sql, a);
    await runWorkbooks(db);
    expect((await readWorkbookRun(db, 'book'))?.status).toBe('needs_attention');
    expect(sql.prepare('SELECT count(*) AS n FROM run_jobs').get()?.n).toBe(0);
  });
  it('caps each batch and the full run before issuing provider requests', () => {
    const ts = tables(),
      run = createWorkbookRun(ts, { id: 'x', maxExternalRequests: 50 });
    ts[0].rows = Array.from({ length: 70 }, (_, i) => ({
      id: String(i),
      values: {},
    }));
    run.scope.first = ts[0].rows.map((r) => r.id);
    const batch = workbookBatch(run, run.steps[0], ts[0]);
    expect(batch.rowIds).toHaveLength(50);
    run.reservedRequests = 50;
    run.steps[0].cursor = 50;
    expect(() => workbookBatch(run, run.steps[0], ts[0])).toThrow(
      'limit reached',
    );
  });
  it('persists CRM refresh summaries and preserves research through an automatic source merge', async () => {
    const { db, sql } = database(),
      [a] = tables();
    a.workbookPlan = undefined;
    a.source = {
      provider: 'hubspot',
      label: 'HubSpot companies',
      objectType: 'company',
      fields: [],
      importedAt: 1,
    };
    a.rows = [
      {
        id: 'kept',
        values: {
          company: 'Old',
          crm_id: '1',
          crm_source: 'HubSpot company',
          research: 'Keep me',
        },
      },
    ];
    save(sql, a);
    await configureCrmRefresh(db, a.id, 'every_day', 100);
    const result = await refreshCrmWorkspace(db, a.id, {
      hubSpotAccessToken: 'test',
      fetchImpl: async () =>
        Response.json({
          results: [
            { id: '1', properties: { name: 'Current', domain: 'example.com' } },
          ],
        }),
    });
    expect(result.workspace.rows[0].values).toMatchObject({
      company: 'Current',
      research: 'Keep me',
      crm_membership: 'In source',
    });
    expect((await getCrmRefresh(db, a.id))?.summary).toMatchObject({
      updated: 1,
      complete: true,
    });
    expect((await getCrmRefresh(db, a.id))?.nextRunAt).toBeGreaterThan(
      Date.now(),
    );
    const persisted = () =>
      JSON.parse(
        String(
          sql.prepare('SELECT snapshot FROM workspaces WHERE id=?').get(a.id)
            ?.snapshot,
        ),
      ) as WorkspaceSnapshot;
    expect(result.workspace.revision).toBe(persisted().revision);
    await expect(
      refreshCrmWorkspace(db, a.id, {
        hubSpotAccessToken: 'test',
        fetchImpl: async () => {
          const edited = persisted();
          edited.rows[0].values.research = 'Typed during provider request';
          save(sql, edited);
          return Response.json({
            results: [
              {
                id: '1',
                properties: { name: 'Too late', domain: 'example.com' },
              },
            ],
          });
        },
      }),
    ).rejects.toThrow('Workspace changed');
    expect(persisted().rows[0].values).toMatchObject({
      company: 'Current',
      research: 'Typed during provider request',
    });
    expect((await getCrmRefresh(db, a.id))?.status).toBe('failed');
  });
});
