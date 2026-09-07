import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { advanceRecipeSchedules } from '../db/schedule-runner';
import { controlRunJob } from '../db/run-job-control';
import { runScheduledCrm } from '../db/scheduled-crm';
import { scheduledTransferStatements } from '../db/scheduled-transfer';
import {
  createRecipeSchedule,
  scheduleExecutionFingerprint,
} from './recipe-schedule';
import { createTable } from './workbook';
import type { RunJob, WorkspaceSnapshot } from './pomade-types';
import type { ApiSourceConfig } from './api-source';
vi.mock('../db/scheduled-crm', () => ({ runScheduledCrm: vi.fn() }));
vi.mock('../db/scheduled-transfer', () => ({
  scheduledTransferStatements: vi.fn(),
}));

const opened: DatabaseSync[] = [];
const now = Date.now();
function fixture(source = false) {
  const sql = new DatabaseSync(':memory:');
  opened.push(sql);
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sql.exec(readFileSync('drizzle/' + file, 'utf8'));
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
        for (const s of statements) results.push(await s.run());
        sql.exec('COMMIT');
        return results;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  const w = createTable({
    id: 'table',
    name: 'Scheduled synthetic table',
    mode: 'empty',
  });
  w.columns.push({
    id: 'normalize',
    title: 'Normalize',
    kind: 'formula',
    recipe: 'normalize-domain',
    width: 180,
  });
  w.rows = [
    { id: 'row', values: { company: 'Example', domain: 'example.test' } },
  ];
  const config: ApiSourceConfig = {
    connectionId: 'fixture',
    method: 'GET',
    path: '/companies',
    recordsPath: 'data',
    identityPath: 'id',
    pagination: 'none',
    parameter: '',
    start: 0,
    pageSize: 1,
    cursorPath: '',
    maxPages: 1,
    maxRows: 1,
  };
  w.schedule = createRecipeSchedule({
    id: 'schedule',
    cadence: 'once',
    now: now - 2000,
    nextRunAt: now - 1000,
    beforeRunSource: source
      ? { config, mapping: { company: 'company', domain: 'domain' } }
      : undefined,
  });
  const store = (value: WorkspaceSnapshot) => {
    const previous = sql
      .prepare('SELECT snapshot FROM workspaces WHERE id=?')
      .get(value.id);
    if (previous)
      value.revision =
        (JSON.parse(previous.snapshot as string).revision ?? 0) + 1;
    sql
      .prepare(
        'INSERT INTO workspaces(id,name,snapshot,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot',
      )
      .run(value.id, value.name, JSON.stringify(value), now, now);
  };
  const read = () =>
    JSON.parse(
      sql.prepare("SELECT snapshot FROM workspaces WHERE id='table'").get()!
        .snapshot as string,
    ) as WorkspaceSnapshot;
  const job = () => {
    const row = sql.prepare('SELECT * FROM run_jobs LIMIT 1').get()!;
    return {
      ...row,
      workspaceId: row.workspace_id,
      rowIds: JSON.parse(row.row_ids as string),
      scheduleExecutionId: row.schedule_execution_id,
    } as unknown as RunJob;
  };
  const call = vi.fn(async () =>
    Response.json({
      batch: {
        id: 'source-batch',
        workspaceId: 'table',
        config,
        createdAt: now,
        records: [
          { id: 'new', value: { company: 'New Example', domain: 'new.test' } },
        ],
        requests: 1,
        pages: 1,
        status: 'complete',
        reason: '',
        creditsConsumed: null,
        externalWrites: 'unknown',
      },
    }),
  );
  store(w);
  const advance = (at = now) => advanceRecipeSchedules(db, at, call, {});
  return { sql, db, w, read, store, job, call, advance };
}
beforeEach(() => {
  vi.mocked(runScheduledCrm).mockReset().mockResolvedValue([]);
  vi.mocked(scheduledTransferStatements)
    .mockReset()
    .mockResolvedValue({ statements: [], receiptId: '', receiptIds: [] });
});
afterEach(() => {
  for (const sql of opened.splice(0)) sql.close();
});

describe('durable scheduled jobs', () => {
  it('imports once, keeps the same queued job across expired leases, then does post-run work only after completion', async () => {
    const f = fixture(true);
    await f.advance();
    const first = f.read();
    expect(first.rows).toHaveLength(2);
    expect(first.schedule).toMatchObject({
      state: 'running',
      sourceExecutionId: first.schedule!.executionId,
      jobId: f.job().id,
    });
    expect(f.job().rowIds).toHaveLength(2);
    await f.advance(now + 20 * 60_000);
    expect(f.call).toHaveBeenCalledTimes(1);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM run_jobs').get()!.n).toBe(
      1,
    );
    expect(runScheduledCrm).not.toHaveBeenCalled();
    expect(scheduledTransferStatements).not.toHaveBeenCalled();
    f.sql.exec("UPDATE run_jobs SET status='completed'");
    await f.advance(now + 21 * 60_000);
    expect(f.read().schedule!.state).toBe('complete');
    expect(runScheduledCrm).toHaveBeenCalledTimes(1);
    expect(scheduledTransferStatements).toHaveBeenCalledTimes(1);
    await f.advance(now + 22 * 60_000);
    expect(runScheduledCrm).toHaveBeenCalledTimes(1);
  });
  it('pauses and resumes both job and schedule without dropping result-check timing or saved columns', async () => {
    const f = fixture();
    await f.advance();
    f.sql
      .prepare(
        "UPDATE run_jobs SET next_check_at=?,resume_column_ids=?,waiting_message='Waiting'",
      )
      .run(now + 60_000, '["normalize"]');
    await controlRunJob(f.db, f.job(), 'pause');
    expect(f.read().schedule!.state).toBe('paused');
    expect(f.job().status).toBe('paused');
    await f.advance(now + 30 * 60_000);
    expect(runScheduledCrm).not.toHaveBeenCalled();
    await controlRunJob(f.db, f.job(), 'resume');
    expect(f.read().schedule!.state).toBe('running');
    expect(f.job().status).toBe('queued');
    expect(
      f.sql
        .prepare('SELECT next_check_at,resume_column_ids FROM run_jobs')
        .get(),
    ).toMatchObject({
      next_check_at: now + 60_000,
      resume_column_ids: '["normalize"]',
    });
  });
  it('stops after enrichment failure and resumes the same occurrence before any transfers or CRM writes', async () => {
    const f = fixture(true);
    await f.advance();
    f.sql.exec("UPDATE run_jobs SET status='failed',last_error='HTTP 429'");
    await f.advance();
    expect(f.read().schedule).toMatchObject({
      state: 'failed',
      lastError: 'HTTP 429',
    });
    expect(runScheduledCrm).not.toHaveBeenCalled();
    await controlRunJob(f.db, f.job(), 'resume');
    await f.advance();
    expect(f.job().status).toBe('queued');
    expect(f.call).toHaveBeenCalledTimes(1);
  });
  it('retries post-run work without repeating completed enrichment or source imports', async () => {
    const f = fixture(true);
    await f.advance();
    f.sql.exec("UPDATE run_jobs SET status='completed'");
    vi.mocked(runScheduledCrm).mockRejectedValueOnce(
      new Error('CRM preview unavailable'),
    );
    await f.advance();
    expect(f.read().schedule!.state).toBe('failed');
    expect(scheduledTransferStatements).not.toHaveBeenCalled();
    await controlRunJob(f.db, f.job(), 'resume');
    expect(f.job().status).toBe('completed');
    await f.advance();
    expect(f.read().schedule!.state).toBe('complete');
    expect(f.call).toHaveBeenCalledTimes(1);
    expect(scheduledTransferStatements).toHaveBeenCalledTimes(1);
  });
  it('refuses to resume edited recipes and permits explicit cancellation followed by a fresh occurrence', async () => {
    const f = fixture();
    await f.advance();
    await controlRunJob(f.db, f.job(), 'pause');
    const edited = f.read();
    edited.columns.find((c) => c.id === 'normalize')!.recipe = 'custom-formula';
    f.store(edited);
    await expect(controlRunJob(f.db, f.job(), 'resume')).rejects.toThrow(
      'changed',
    );
    await controlRunJob(f.db, f.job(), 'cancel');
    expect(f.job().status).toBe('cancelled');
    await expect(controlRunJob(f.db, f.job(), 'resume')).rejects.toThrow(
      'paused or failed',
    );
    const fresh = f.read();
    const oldId = fresh.schedule!.executionId;
    fresh.schedule = {
      ...fresh.schedule!,
      ...createRecipeSchedule({
        id: 'new',
        cadence: 'once',
        nextRunAt: now + 1,
        now,
      }),
    };
    expect(fresh.schedule.executionId).toBeUndefined();
    f.store(fresh);
    await f.advance(now + 2);
    expect(f.read().schedule!.executionId).not.toBe(oldId);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM run_jobs').get()!.n).toBe(
      2,
    );
  });
  it('does not send post-run work to edited destinations', async () => {
    const f = fixture();
    await f.advance();
    const edited = f.read();
    edited.schedule!.rowIds = ['changed'];
    f.store(edited);
    f.sql.exec("UPDATE run_jobs SET status='completed'");
    await f.advance();
    expect(f.read().schedule!.lastError).toContain('changed');
    expect(runScheduledCrm).not.toHaveBeenCalled();
  });
  it('creates a new job for a new recurring occurrence and clears old source checkpoints', async () => {
    const f = fixture(true);
    f.w.schedule!.cadence = 'every_day';
    f.store(f.w);
    await f.advance();
    const first = f.read();
    f.sql.exec("UPDATE run_jobs SET status='completed'");
    await f.advance();
    expect(f.read().schedule!.state).toBe('active');
    await f.advance(now + 24 * 60 * 60_000);
    expect(f.read().schedule!.executionId).not.toBe(
      first.schedule!.executionId,
    );
    expect(f.call).toHaveBeenCalledTimes(2);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM run_jobs').get()!.n).toBe(
      2,
    );
  });
  it('completes an empty source scope without inventing a receipt or creating an invalid job', async () => {
    const f = fixture();
    f.w.rows = [];
    f.store(f.w);
    await f.advance();
    await f.advance();
    expect(f.read().schedule).toMatchObject({ state: 'complete' });
    expect(f.read().schedule!.lastRunId).toBeUndefined();
    expect(f.job()).toMatchObject({ status: 'completed', rowIds: [] });
  });
  it('leaves column-title and width edits outside the frozen execution settings', () => {
    const f = fixture();
    const before = scheduleExecutionFingerprint(f.w);
    f.w.columns.find((c) => c.id === 'normalize')!.title = 'New title';
    f.w.columns.find((c) => c.id === 'normalize')!.width = 200;
    expect(scheduleExecutionFingerprint(f.w)).toBe(before);
  });
});
