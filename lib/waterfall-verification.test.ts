import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asyncProviderFixture,
  closeAsyncProviderFixtures,
} from './async-provider.test-support';
import { configuredHttpConnections } from './provider-connections';
import { executeRecipePipeline } from './recipe-pipeline';
import { createProviderWaterfall } from './provider-waterfall';
import { contactVerifierStep } from './contact-provider-presets';
import { countMaximumExternalActions } from './external-recipes';

function fixture(verifier = 'hunter-verify') {
  const f = asyncProviderFixture('enrow-email', true);
  const config = f.column.providerWaterfall!;
  config.steps.splice(1, 1);
  config.steps[0].verifier = { presetId: verifier };
  f.connections.push(
    ...configuredHttpConnections({
      HUNTER_API_KEY: 'test-only',
      TRESTLE_API_KEY: 'test-only',
    }),
  );
  return f;
}
afterEach(() => {
  vi.useRealTimers();
  closeAsyncProviderFixtures();
});

describe('find, verify and fallback in one waterfall', () => {
  it('verifies the candidate from the finder, rather than the email already in the sheet', async () => {
    const f = fixture();
    f.fetcher
      .mockResolvedValueOnce(Response.json({ email: 'fresh@example.com' }))
      .mockResolvedValueOnce(
        Response.json({
          data: { email: 'fresh@example.com', status: 'valid' },
        }),
      );
    const result = await f.run();
    expect(
      new URL(f.fetcher.mock.calls[1][0] as string).searchParams.get('email'),
    ).toBe('fresh@example.com');
    expect(result.receipt.after).toBe('fresh@example.com');
    expect(
      result.receipt.attempts?.map((a) => [a.operationRole, a.outcome]),
    ).toEqual([
      ['lookup', 'accepted'],
      ['verification', 'accepted'],
    ]);
    expect(result.workspace.rows[0].values.email).toBe('ada@example.com');
    expect(result.workspace.rows[0].values.pomade_candidate).toBeUndefined();
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(countMaximumExternalActions(f.w.rows, [f.column])).toBe(3);
  });
  it.each(['invalid', 'accept_all', 'unknown'])(
    'falls back on verifier status %s and attributes the match to the next finder',
    async (status) => {
      const f = fixture();
      f.fetcher
        .mockResolvedValueOnce(Response.json({ email: 'reject@example.com' }))
        .mockResolvedValueOnce(
          Response.json({ data: { email: 'reject@example.com', status } }),
        )
        .mockResolvedValueOnce(
          Response.json({ email: 'good@example.com', status: 'valid' }),
        );
      const result = await f.run();
      expect(result.receipt.after).toBe('good@example.com');
      expect(result.receipt.attempts?.map((a) => a.outcome)).toEqual([
        'rejected',
        'rejected',
        'accepted',
      ]);
      expect(result.workspace.rows[0].values.result_provider).toBe('last');
    },
  );
  it('skips verification when the finder has no candidate', async () => {
    const f = fixture();
    f.fetcher
      .mockResolvedValueOnce(Response.json({ email: '' }))
      .mockResolvedValueOnce(
        Response.json({ email: 'good@example.com', status: 'valid' }),
      );
    expect((await f.run()).receipt.attempts).toHaveLength(2);
    expect(
      f.fetcher.mock.calls.every(
        ([url]) =>
          !new URL(url instanceof Request ? url.url : url).hostname.includes(
            'hunter',
          ),
      ),
    ).toBe(true);
  });
  it('resumes a verifier error without repeating the finder or running downstream actions', async () => {
    const f = fixture();
    f.w.columns.push({
      id: 'later',
      title: 'Later',
      kind: 'formula',
      recipe: 'custom-formula',
      expression: '{{result}}',
      width: 120,
    });
    f.fetcher
      .mockResolvedValueOnce(Response.json({ email: 'fresh@example.com' }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        Response.json({
          data: { email: 'fresh@example.com', status: 'valid' },
        }),
      );
    const first = await executeRecipePipeline(
      f.w,
      ['row'],
      ['result', 'later'],
      {},
      () => f.run(),
    );
    expect(first.run.receipts[0].error).toContain('429');
    expect(first.workspace.rows[0].values.later).toBeUndefined();
    const resumed = await f.run();
    expect(resumed.receipt.after).toBe('fresh@example.com');
    expect(resumed.receipt.attempts?.[0]).toMatchObject({
      cached: true,
      httpRequestCount: 0,
    });
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  });
  it('persists an asynchronous verifier ID separately and only falls back after a final rejection', async () => {
    vi.useFakeTimers();
    const f = fixture('enrow-verify');
    f.fetcher
      .mockResolvedValueOnce(Response.json({ email: 'fresh@example.com' }))
      .mockResolvedValueOnce(
        Response.json({ id: 'verify-1', credits_used: 0.25 }),
      )
      .mockResolvedValueOnce(
        Response.json({ email: 'fresh@example.com', qualification: 'invalid' }),
      )
      .mockResolvedValueOnce(
        Response.json({ email: 'good@example.com', status: 'valid' }),
      );
    expect((await f.run()).receipt.pending).toBe(true);
    expect(JSON.parse(f.fetcher.mock.calls[1][1]?.body as string)).toEqual({
      email: 'fresh@example.com',
    });
    const saved = JSON.parse(
      f.sql.prepare('SELECT state FROM waterfall_progress').get()!
        .state as string,
    );
    expect(saved.requests.v0.requestId).toBe('verify-1');
    expect(saved.attempts['0'].after).toBe('fresh@example.com');
    expect((await f.run()).receipt.pending).toBe(true);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 60_000);
    const result = await f.run();
    expect(result.receipt.after).toBe('good@example.com');
    expect(f.fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
      'GET',
      'POST',
      'GET',
      'GET',
    ]);
  });
  it('withholds a different contact returned by the verifier, even with continue-on-error', async () => {
    const f = fixture();
    f.column.providerWaterfall!.continueOnError = true;
    f.fetcher
      .mockResolvedValueOnce(Response.json({ email: 'fresh@example.com' }))
      .mockResolvedValueOnce(
        Response.json({
          data: { email: 'different@example.com', status: 'valid' },
        }),
      );
    expect((await f.run()).receipt.error).toContain('different contact');
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it('checks phone syntax using the phone verifier and does not claim mobile ownership', async () => {
    const f = fixture('trestle-verify');
    f.column.providerWaterfall!.accept = 'verified-phone';
    f.column.providerWaterfall!.steps.splice(1);
    f.fetcher
      .mockResolvedValueOnce(Response.json({ email: '+1 (202) 555-0123' }))
      .mockResolvedValueOnce(
        Response.json({ phone_number: '+12025550123', is_valid: true }),
      );
    const result = await f.run();
    expect(result.receipt.error).toBeUndefined();
    expect(result.receipt.after).toBe('+12025550123');
  });
  it('rejects wrong-type and unsupported verifier settings before requests', () => {
    const f = fixture();
    expect(() =>
      createProviderWaterfall(f.w, {
        id: 'other',
        title: 'Other',
        steps: [
          {
            ...f.column.providerWaterfall!.steps[0],
            verifier: { presetId: 'trestle-verify' },
          },
        ],
        accept: 'email',
        continueOnError: false,
      }),
    ).toThrow('match');
    expect(() => contactVerifierStep('unknown')).toThrow();
  });
});
