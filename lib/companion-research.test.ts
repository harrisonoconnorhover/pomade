import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  claimCompanionRequest,
  companionStatus,
  finishCompanionRequest,
  HostedCodexWebResearchClient,
  COMPANION_LEASE_MS,
} from './companion-research';
import {
  companionConfiguration,
  runCompanion,
} from '../scripts/research-companion.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const databases: DatabaseSync[] = [];
function fixture() {
  const sql = new DatabaseSync(':memory:');
  databases.push(sql);
  // Apply the actual new migration, including its additive legacy job change.
  sql.exec(
    'CREATE TABLE run_jobs(id TEXT PRIMARY KEY); CREATE TABLE workspaces(id TEXT PRIMARY KEY, snapshot TEXT)',
  );
  sql.exec(
    readFileSync(
      new URL('../drizzle/0005_loud_shinko_yamashiro.sql', import.meta.url),
      'utf8',
    ),
  );
  sql.exec(
    readFileSync(
      new URL('../drizzle/0006_pretty_black_cat.sql', import.meta.url),
      'utf8',
    ),
  );
  sql.exec(
    readFileSync(
      new URL('../drizzle/0007_green_red_ghost.sql', import.meta.url),
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
          all: async () => ({ results: stmt.all(...(args as never[])) }),
        };
      }
      return bound([]);
    },
  } as unknown as D1Database;
  return {
    db,
    sql,
    client: new HostedCodexWebResearchClient(db, { browser: true }),
  };
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
const result = {
  answer: 'A supported answer',
  citations: [{ url: 'https://example.com', title: 'Source' }],
  queries: ['example'],
  model: 'Codex',
  cached: false,
};

describe('durable Mac research', () => {
  it('keeps offline work pending, claims it once, then reuses the completed answer', async () => {
    const { db, client, sql } = fixture();
    expect((await companionStatus(db)).ready).toBe(false);
    await expect(client.research('Research Example')).rejects.toThrow(
      'Waiting',
    );
    await expect(client.research('Research Example')).rejects.toThrow(
      'Waiting',
    );
    expect(
      sql.prepare('SELECT COUNT(*) AS n FROM research_requests').get()?.n,
    ).toBe(1);
    const job = (await claimCompanionRequest(db))!;
    expect(job.prompt).toBe('Research Example');
    expect(await claimCompanionRequest(db)).toBeNull();
    expect(
      await finishCompanionRequest(db, {
        id: job.id,
        leaseToken: 'stale',
        result,
      }),
    ).toBe(false);
    expect(
      await finishCompanionRequest(db, {
        id: job.id,
        leaseToken: job.lease_token,
        result,
      }),
    ).toBe(true);
    expect(
      await finishCompanionRequest(db, {
        id: job.id,
        leaseToken: job.lease_token,
        result,
      }),
    ).toBe(true);
    expect(await client.research('Research Example')).toEqual(result);
  });
  it('reclaims an interrupted lease and rejects the earlier worker result', async () => {
    const { db, client } = fixture();
    await expect(client.research('Question')).rejects.toThrow('Waiting');
    const first = (await claimCompanionRequest(db, 100))!;
    const second = (await claimCompanionRequest(db, 100 + COMPANION_LEASE_MS))!;
    expect(second.lease_token).not.toBe(first.lease_token);
    expect(
      await finishCompanionRequest(db, {
        id: first.id,
        leaseToken: first.lease_token,
        result,
      }),
    ).toBe(false);
    expect(
      await finishCompanionRequest(db, {
        id: second.id,
        leaseToken: second.lease_token,
        result,
      }),
    ).toBe(true);
  });
  it('requires a fresh ready heartbeat and handles local busy responses without losing work', async () => {
    const { db, sql, client } = fixture();
    sql
      .prepare(
        'INSERT INTO research_companion (id,ready,browser_available,updated_at) VALUES (1,1,1,100)',
      )
      .run();
    expect((await companionStatus(db, 200)).ready).toBe(true);
    expect((await companionStatus(db, 50_000)).ready).toBe(false);
    await expect(client.research('Question')).rejects.toThrow('Waiting');
    const job = (await claimCompanionRequest(db))!;
    await finishCompanionRequest(db, {
      id: job.id,
      leaseToken: job.lease_token,
      error: 'Busy',
      retry: true,
    });
    expect((await claimCompanionRequest(db))?.id).toBe(job.id);
  });
  it('does not forward hosted credentials to the local helper and retries a lost completion response', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pomade-companion-test-'));
    const config = companionConfiguration({
      POMADE_HOSTED_URL: 'https://pomade.example.com',
      POMADE_COMPANION_TOKEN: 'p'.repeat(64),
      POMADE_SITES_TOKEN: 'sites-secret',
      POMADE_CODEX_TOKEN: 'helper-secret',
    });
    const controller = new AbortController();
    let claimed = false,
      researches = 0,
      finishes = 0;
    const fetchImpl = async (input: unknown, options: RequestInit = {}) => {
      const url = String(input),
        headers = new Headers(options.headers);
      if (url.endsWith('/status'))
        return Response.json({
          configured: true,
          browserAvailable: true,
          researchSettingsVersion: 1,
        });
      if (url.endsWith('/models'))
        return Response.json({ models: [], updatedAt: 0 });
      if (url.endsWith('/research')) {
        expect(
          JSON.parse(typeof options.body === 'string' ? options.body : '{}'),
        ).toMatchObject({
          model: 'model-a',
          reasoningEffort: 'high',
        });
        researches++;
        expect(headers.get('authorization')).toBe('Bearer helper-secret');
        expect(headers.has('OAI-Sites-Authorization')).toBe(false);
        return Response.json(result);
      }
      expect(headers.get('OAI-Sites-Authorization')).toBe(
        'Bearer sites-secret',
      );
      const body = JSON.parse(
        typeof options.body === 'string' ? options.body : '{}',
      );
      if (body.action === 'finish') {
        finishes++;
        if (finishes === 1) throw new Error('Lost response');
        controller.abort();
        return Response.json({ accepted: true });
      }
      const job =
        !claimed && body.claim
          ? {
              id: 'job',
              lease_token: 'lease',
              prompt: 'Question',
              browser: 1,
              model: 'model-a',
              reasoning_effort: 'high',
            }
          : null;
      if (job) claimed = true;
      return Response.json({ job });
    };
    try {
      await runCompanion(config, {
        signal: controller.signal,
        fetchImpl: fetchImpl as typeof fetch,
        pollMs: 1,
        outbox: join(dir, 'outbox.json'),
        log: () => {},
      });
      expect(researches).toBe(1);
      expect(finishes).toBe(2);
      await expect(readFile(join(dir, 'outbox.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

it('keeps queued research separate by model and effort and returns the selected settings to the companion', async () => {
  const { db, sql } = fixture();
  for (const options of [
    { model: 'model-a', reasoningEffort: 'medium' },
    { model: 'model-a', reasoningEffort: 'high' },
    { model: 'model-b', reasoningEffort: 'high' },
  ]) {
    await expect(
      new HostedCodexWebResearchClient(db, options).research('Same question'),
    ).rejects.toThrow('Waiting');
  }
  expect(
    sql.prepare('SELECT COUNT(*) AS n FROM research_requests').get()?.n,
  ).toBe(3);
  expect(await claimCompanionRequest(db)).toMatchObject({
    model: 'model-a',
    reasoning_effort: 'medium',
  });
});

it('keeps planning separate from research and waits for a planning-capable companion', async () => {
  const { db, sql } = fixture();
  const planner = new HostedCodexWebResearchClient(db, {
    browser: false,
    purpose: 'plan',
  });
  await expect(planner.research('Same input')).rejects.toThrow('Waiting');
  await expect(planner.research('Same input')).rejects.toThrow('Waiting');
  expect(
    sql.prepare('SELECT COUNT(*) AS n FROM research_requests').get()?.n,
  ).toBe(1);
  expect(await claimCompanionRequest(db)).toBeNull();
  const job = await claimCompanionRequest(db, Date.now(), true);
  expect(job).toMatchObject({
    purpose: 'plan',
    browser: 0,
    prompt: 'Same input',
  });
  await finishCompanionRequest(db, {
    id: job!.id,
    leaseToken: job!.lease_token,
    result,
  });
  expect(await planner.research('Same input')).toEqual(result);
  const researcher = new HostedCodexWebResearchClient(db, { browser: false });
  await expect(researcher.research('Same input')).rejects.toThrow('Waiting');
  expect((await claimCompanionRequest(db))?.purpose).toBe('research');
});
