import { vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createTable } from './workbook';
import {
  contactPreset,
  type ContactBindings,
} from './contact-provider-presets';
import {
  createProviderWaterfall,
  executeProviderWaterfall,
} from './provider-waterfall';
import { configuredHttpConnections } from './provider-connections';

const databases: DatabaseSync[] = [];
export function asyncProviderFixture(presetId: string, surrounding = false) {
  const sql = new DatabaseSync(':memory:');
  databases.push(sql);
  sql.exec(
    "CREATE TABLE workspaces (id TEXT PRIMARY KEY); INSERT INTO workspaces VALUES ('table')",
  );
  sql.exec(
    readFileSync(
      new URL('../drizzle/0010_kind_lenny_balinger.sql', import.meta.url),
      'utf8',
    ),
  );
  const db = {
    prepare(query: string) {
      const stmt = sql.prepare(query);
      function bound(args: unknown[]) {
        return {
          bind: (...next: unknown[]) => bound(next),
          first: async () => stmt.get(...(args as never[])) ?? null,
          run: async () => ({
            meta: { changes: Number(stmt.run(...(args as never[])).changes) },
          }),
        };
      }
      return bound([]);
    },
  } as unknown as D1Database;
  const w = createTable({
    id: 'table',
    name: 'Synthetic async provider',
    mode: 'empty',
  });
  const bindings = Object.fromEntries(
    [
      'person',
      'domain',
      'email',
      'profile',
      'phone',
      'first_name',
      'last_name',
    ].map((k) => [k, k]),
  ) as ContactBindings;
  for (const id of Object.values(bindings))
    if (!w.columns.some((c) => c.id === id))
      w.columns.push({ id, title: id, kind: 'text', width: 180 });
  w.rows = [
    {
      id: 'row',
      values: {
        company: 'Example',
        person: 'Ada Example',
        first_name: 'Ada',
        last_name: 'Example',
        domain: 'example.com',
        email: 'ada@example.com',
        profile: 'https://www.linkedin.com/in/ada-example',
        result: 'old@example.com',
      },
    },
  ];
  const preset = contactPreset(presetId)!;
  const first = {
    connectionId: 'first',
    method: 'GET' as const,
    pathTemplate: '/lookup',
    responsePath: 'email',
    verification: { path: 'status', acceptedValues: ['valid'] },
  };
  const steps = surrounding
    ? [first, preset.step(bindings), { ...first, connectionId: 'last' }]
    : [preset.step(bindings)];
  const columns = createProviderWaterfall(w, {
    id: 'result',
    title: 'Contact',
    steps,
    accept: preset.accept,
    continueOnError: false,
  });
  w.columns.push(...columns);
  const connections = [
    ...configuredHttpConnections({
      ENROW_API_KEY: 'synthetic-private-key',
      FULLENRICH_API_KEY: 'synthetic-private-key',
    }),
    ...['first', 'last'].map((id) => ({
      id,
      label: id,
      origin: `https://${id}.test`,
      methods: ['GET' as const],
      headers: {},
    })),
  ];
  const fetcher = vi.fn<typeof fetch>();
  const run = (executionId = 'job') =>
    executeProviderWaterfall(w, 'row', columns[0], connections, fetcher, {
      db,
      id: executionId,
    });
  return { w, column: columns[0], connections, fetcher, run, sql, db };
}

export function closeAsyncProviderFixtures() {
  for (const db of databases.splice(0)) db.close();
}
