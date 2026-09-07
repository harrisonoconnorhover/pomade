import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asyncProviderFixture,
  closeAsyncProviderFixtures,
} from './async-provider.test-support';
import { executeProviderWaterfall } from './provider-waterfall';
import { executeRecipePipeline } from './recipe-pipeline';
import { ENROW_POLL_INTERVAL_MS, ENROW_WAIT_WINDOW_MS } from './enrow';
import { WaterfallProgress } from '../db/waterfall-progress';

const fixture = (presetId = 'enrow-email', surrounding = false) =>
  asyncProviderFixture(presetId, surrounding);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  closeAsyncProviderFixtures();
});
const tick = () => vi.setSystemTime(Date.now() + 60_000);

describe('Enrow durable background lookups', () => {
  it.each([
    [
      'enrow-email',
      '/email/find/single',
      { fullname: 'Ada Example', company_domain: 'example.com' },
      { email: 'ada@example.com', qualification: 'valid' },
      1,
    ],
    [
      'enrow-verify',
      '/email/verify/single',
      { email: 'ada@example.com' },
      { email: 'ada@example.com', qualification: 'valid' },
      0.25,
    ],
    [
      'enrow-phone',
      '/phone/single',
      { linkedin_url: 'https://www.linkedin.com/in/ada-example' },
      { number: '+12025550123', qualification: 'found' },
      50,
    ],
  ] as const)(
    'submits %s once, waits and resumes the saved search',
    async (id, path, body, completed, credits) => {
      vi.useFakeTimers();
      const f = fixture(id);
      f.fetcher
        .mockResolvedValueOnce(
          Response.json(
            { id: 'search-123', credits_used: credits },
            { status: id === 'enrow-phone' ? 201 : 200 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json({ qualification: 'ongoing' }, { status: 202 }),
        )
        .mockResolvedValueOnce(Response.json(completed));
      const submitted = await f.run();
      expect(submitted.receipt).toMatchObject({
        pending: true,
        creditsConsumed: credits,
        httpRequestCount: 1,
      });
      expect(submitted.workspace.rows[0].values.result).toBe('old@example.com');
      const [url, init] = f.fetcher.mock.calls[0];
      expect(new URL(url as string).pathname).toBe(path);
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual(body);
      expect(new Headers(init?.headers).get('x-api-key')).toBe(
        'synthetic-private-key',
      );
      expect(JSON.stringify(submitted)).not.toContain('synthetic-private-key');
      expect(
        f.sql.prepare('SELECT state FROM waterfall_progress').get()?.state,
      ).toContain('search-123');
      expect((await f.run()).receipt).toMatchObject({
        pending: true,
        httpRequestCount: 0,
        creditsConsumed: 0,
      });
      tick();
      expect((await f.run()).receipt.pending).toBe(true);
      tick();
      const final = await f.run();
      expect(final.receipt).toMatchObject({
        status: 'passed',
        creditsConsumed: 0,
        httpRequestCount: 1,
      });
      expect(final.receipt.pending).toBeUndefined();
      expect(final.receipt.after).toBe(
        'email' in completed ? completed.email : completed.number,
      );
      expect(
        new URL(f.fetcher.mock.calls[1][0] as string).searchParams.get('id'),
      ).toBe('search-123');
      expect(f.fetcher.mock.calls.map(([, i]) => i?.method)).toEqual([
        'POST',
        'GET',
        'GET',
      ]);
      await f.run();
      expect(f.fetcher).toHaveBeenCalledTimes(3);
    },
  );
  it('resumes within a waterfall and only falls back after a completed miss', async () => {
    vi.useFakeTimers();
    const f = fixture('enrow-email', true);
    f.fetcher
      .mockResolvedValueOnce(Response.json({ email: '', status: 'invalid' }))
      .mockResolvedValueOnce(Response.json({ id: 's' }))
      .mockResolvedValueOnce(
        Response.json({ qualification: 'ongoing' }, { status: 202 }),
      )
      .mockResolvedValueOnce(
        Response.json({ email: 'bad@example.com', qualification: 'invalid' }),
      )
      .mockResolvedValueOnce(
        Response.json({ email: 'good@example.com', status: 'valid' }),
      );
    expect((await f.run()).receipt.pending).toBe(true);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    tick();
    await f.run();
    tick();
    const done = await f.run();
    expect(done.receipt.after).toBe('good@example.com');
    expect(done.receipt.attempts?.[0]).toMatchObject({
      cached: true,
      creditsConsumed: 0,
    });
    expect(
      f.fetcher.mock.calls.map(([u]) => new URL(u as string).hostname),
    ).toEqual([
      'first.test',
      'api.enrow.io',
      'api.enrow.io',
      'api.enrow.io',
      'last.test',
    ]);
  });
  it('stops the recipe pipeline while waiting and leaves downstream outputs untouched', async () => {
    const f = fixture();
    f.w.columns.push({
      id: 'later',
      title: 'Later',
      kind: 'enrichment',
      recipe: 'http-api',
      width: 100,
    });
    f.fetcher.mockResolvedValueOnce(Response.json({ id: 's' }));
    const external = vi.fn(async () => f.run());
    const result = await executeRecipePipeline(
      f.w,
      ['row'],
      ['result', 'later'],
      {},
      external,
    );
    expect(external).toHaveBeenCalledTimes(1);
    expect(result.run.receipts[0].pending).toBe(true);
  });
  it.each(['lost', 'missing-id', 'server-error'])(
    'never resubmits an uncertain %s submission, including continue-on-error',
    async (kind) => {
      const f = fixture('enrow-email', true);
      f.column.providerWaterfall!.steps.shift();
      f.column.providerWaterfall!.continueOnError = true;
      if (kind === 'lost')
        f.fetcher.mockRejectedValueOnce(new Error('network disconnected'));
      else
        f.fetcher.mockResolvedValueOnce(
          Response.json(kind === 'missing-id' ? {} : { message: 'failed' }, {
            status: kind === 'server-error' ? 500 : 200,
          }),
        );
      expect((await f.run()).receipt.error).toContain(
        'no request ID was saved',
      );
      expect((await f.run()).receipt.error).toContain(
        'no request ID was saved',
      );
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([400, 401, 402, 429])(
    'keeps HTTP %s rejection distinct from a miss and allows explicit resume',
    async (status) => {
      const f = fixture();
      f.fetcher
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(Response.json({ id: 'after-fix' }));
      expect((await f.run()).receipt.error).toContain(`HTTP ${status}`);
      expect((await f.run()).receipt.pending).toBe(true);
      expect(f.fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it.each([429, 500])(
    'retains the search ID after a polling HTTP %s error',
    async (status) => {
      vi.useFakeTimers();
      const f = fixture();
      f.fetcher
        .mockResolvedValueOnce(Response.json({ id: 's' }))
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(
          Response.json({ email: 'ada@example.com', qualification: 'valid' }),
        );
      await f.run();
      tick();
      expect((await f.run()).receipt.error).toContain('checking search s');
      tick();
      expect((await f.run()).receipt.status).toBe('passed');
      expect(f.fetcher.mock.calls.map(([, i]) => i?.method)).toEqual([
        'POST',
        'GET',
        'GET',
      ]);
    },
  );
  it('pauses long waits, then resumes polling the original ID', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.fetcher
      .mockResolvedValueOnce(Response.json({ id: 's' }))
      .mockResolvedValueOnce(
        Response.json({ email: 'ada@example.com', qualification: 'valid' }),
      );
    await f.run();
    vi.setSystemTime(Date.now() + ENROW_WAIT_WINDOW_MS + 1);
    expect((await f.run()).receipt.error).toContain('30 minutes');
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect((await f.run()).receipt.status).toBe('passed');
    expect(f.fetcher.mock.calls[1][1]?.method).toBe('GET');
  });
  it('rejects changed inputs or recipe settings before sending another request', async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(Response.json({ id: 's' }));
    await f.run();
    f.w.rows[0].values.person = 'Another person';
    await expect(f.run()).rejects.toThrow('inputs or settings changed');
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it('allows a deliberately new job to start fresh, without reusing a past result', async () => {
    const f = fixture();
    f.fetcher.mockImplementation(async () => Response.json({ id: 's' }));
    await f.run('one');
    await f.run('two');
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it('refuses the immediate path before running earlier providers', async () => {
    const f = fixture('enrow-email', true);
    await expect(
      executeProviderWaterfall(f.w, 'row', f.column, f.connections, f.fetcher),
    ).rejects.toThrow('background');
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    ['enrow-verify', 'email', 'malformed'],
    ['enrow-phone', 'profile', 'https://www.linkedin.com/sales/lead/123'],
  ])('rejects bad %s input locally', async (id, key, value) => {
    const f = fixture(id);
    f.w.rows[0].values[key] = value;
    expect((await f.run()).receipt.error).toBeTruthy();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { email: 'other@example.com', qualification: 'valid' },
    { email: 'ada@example.com', qualification: 'catch_all' },
    { qualification: 'valid' },
  ])(
    'withholds malformed or mismatched verification results %j',
    async (data) => {
      vi.useFakeTimers();
      const f = fixture('enrow-verify');
      f.fetcher
        .mockResolvedValueOnce(Response.json({ id: 's' }))
        .mockResolvedValueOnce(Response.json(data));
      await f.run();
      vi.setSystemTime(Date.now() + ENROW_POLL_INTERVAL_MS);
      expect((await f.run()).receipt.error).toBeTruthy();
    },
  );
  it('claims submission atomically across two workers', async () => {
    const f = fixture();
    const input = {
      executionId: 'job',
      workspaceId: 'table',
      rowId: 'row',
      columnId: 'result',
      fingerprint: 'same',
    };
    const a = await WaterfallProgress.open(f.db, input),
      b = await WaterfallProgress.open(f.db, input);
    const request = {
      phase: 'submitting' as const,
      submittedAt: 1,
      nextPollAt: 1,
      pollCount: 0,
    };
    await a.saveRequest(0, request);
    await expect(b.saveRequest(0, request)).rejects.toThrow('Another worker');
  });
});
