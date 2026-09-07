import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  asyncProviderFixture as fixture,
  closeAsyncProviderFixtures,
} from './async-provider.test-support';
import {
  parseApolloJson,
  apolloRequestId,
  apolloPhoneResult,
} from './apollo-phone';
import { dropcontactResult } from './dropcontact';
import { configuredHttpConnections } from './provider-connections';
import { publicHttpConnections } from './http-enrichment';
const tick = (ms = 30_000) => vi.setSystemTime(Date.now() + ms);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  closeAsyncProviderFixtures();
});
function dropResult(
  f: ReturnType<typeof fixture>,
  email: unknown = [
    { email: 'ada@example.com', qualification: 'nominative@pro' },
  ],
) {
  const body = JSON.parse(
    f.fetcher.mock.calls.find(([, i]) => i?.method === 'POST')![1]
      ?.body as string,
  );
  return {
    error: false,
    success: true,
    data: [{ custom_fields: body.data[0].custom_fields, email }],
  };
}
const phone = {
  type_cd: 'mobile',
  status_cd: 'valid_number',
  sanitized_number: '+12025550123',
};
function apolloResult(id = '1039995589705121900', personId = 'person-1') {
  return {
    request_id: id,
    request_type: 'phone',
    webhook_status: 'failed',
    webhook_result: {
      status: 'success',
      credits_consumed: 2,
      people: [{ id: personId, status: 'success', phone_numbers: [phone] }],
    },
  };
}
describe('Dropcontact background lookup', () => {
  it('saves correlation, waits, resumes and accepts only the named work email without treating balance as cost', async () => {
    vi.useFakeTimers();
    const f = fixture('dropcontact-email');
    f.fetcher
      .mockResolvedValueOnce(
        Response.json({
          request_id: 'saved-drop',
          success: true,
          error: false,
          credits_left: 49,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          error: false,
          success: false,
          reason: 'Request not ready yet, try again in 30 seconds',
        }),
      )
      .mockImplementation(async () => Response.json(dropResult(f)));
    expect((await f.run()).receipt).toMatchObject({
      pending: true,
      httpRequestCount: 1,
      creditsConsumed: null,
    });
    const init = f.fetcher.mock.calls[0][1]!;
    expect(new Headers(init.headers).get('X-Access-Token')).toBe(
      'synthetic-private-key',
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      language: 'en',
      data: [
        {
          first_name: 'Ada',
          last_name: 'Example',
          website: 'example.com',
          custom_fields: { pomade_request: expect.any(String) },
        },
      ],
    });
    expect((await f.run()).receipt.httpRequestCount).toBe(0);
    tick();
    expect((await f.run()).receipt.pending).toBe(true);
    tick();
    expect((await f.run()).receipt).toMatchObject({
      after: 'ada@example.com',
      status: 'passed',
      creditsConsumed: null,
    });
    expect(f.fetcher.mock.calls[1][0]).toBe(
      'https://api.dropcontact.com/v1/enrich/all/saved-drop',
    );
    await f.run();
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  });
  it('continues the waterfall after a real miss and holds results with conflicting correlation', async () => {
    vi.useFakeTimers();
    const f = fixture('dropcontact-email', true);
    f.fetcher
      .mockResolvedValueOnce(Response.json({ email: '', status: 'invalid' }))
      .mockResolvedValueOnce(
        Response.json({
          request_id: 'saved-drop',
          success: true,
          error: false,
        }),
      )
      .mockImplementationOnce(async () => Response.json(dropResult(f, [])))
      .mockResolvedValueOnce(
        Response.json({ email: 'last@example.com', status: 'valid' }),
      );
    expect((await f.run()).receipt.pending).toBe(true);
    tick();
    expect((await f.run()).receipt.after).toBe('last@example.com');
    const other = fixture('dropcontact-email');
    other.fetcher
      .mockResolvedValueOnce(
        Response.json({
          request_id: 'saved-drop',
          success: true,
          error: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          error: false,
          success: true,
          data: [
            {
              custom_fields: { pomade_request: 'wrong' },
              email: [
                { email: 'wrong@example.com', qualification: 'nominative@pro' },
              ],
            },
          ],
        }),
      );
    await other.run();
    tick();
    expect((await other.run()).receipt.error).toContain('matching contact');
  });
  it.each(['catch_all@pro', 'generic@pro', 'nominative@perso', 'invalid@pro'])(
    'rejects %s',
    (qualification) =>
      expect(
        dropcontactResult({
          email: [{ email: 'ada@example.com', qualification }],
        }).pomade.email,
      ).toBe(''),
  );
});
describe('Apollo mobile polling', () => {
  it.each(['1039995589705121900', '-9223372036854775808'])(
    'preserves numeric request ID %s and resumes without repeating submission',
    async (id) => {
      vi.useFakeTimers();
      const f = fixture('apollo-mobile');
      f.fetcher
        .mockResolvedValueOnce(
          new Response(`{"request_id":${id},"person":{"id":"person-1"}}`),
        )
        .mockResolvedValueOnce(
          Response.json(
            { error_code: 'result_pending', retry_after_seconds: 60 },
            { status: 404 },
          ),
        )
        .mockResolvedValueOnce(Response.json(apolloResult(id)));
      expect((await f.run()).receipt.pending).toBe(true);
      const body = JSON.parse(f.fetcher.mock.calls[0][1]?.body as string);
      expect(body).toEqual({
        name: 'Ada Example',
        domain: 'example.com',
        reveal_phone_number: true,
        reveal_personal_emails: false,
        webhook_url: 'https://callback.example.test/apollo',
      });
      tick();
      expect((await f.run()).receipt.pending).toBe(true);
      tick();
      expect((await f.run()).receipt.httpRequestCount).toBe(0);
      tick();
      const done = await f.run();
      expect(done.receipt).toMatchObject({
        after: '+12025550123',
        status: 'passed',
        creditsConsumed: 2,
      });
      expect(f.fetcher.mock.calls[2][0]).toBe(
        'https://api.apollo.io/api/v1/webhook_result/' + id,
      );
      await f.run();
      expect(f.fetcher).toHaveBeenCalledTimes(3);
    },
  );
  it.each(['invalid_request_id', 'request_id_unknown', 'request_id_expired'])(
    'never repolls terminal %s results on resume',
    async (code) => {
      vi.useFakeTimers();
      const f = fixture('apollo-mobile');
      f.fetcher
        .mockResolvedValueOnce(
          Response.json({ request_id: '42', person: { id: 'person-1' } }),
        )
        .mockResolvedValueOnce(
          Response.json(
            { error_code: code },
            { status: code === 'request_id_expired' ? 410 : 404 },
          ),
        );
      await f.run();
      tick();
      expect((await f.run()).receipt.error).toContain(code);
      tick();
      expect((await f.run()).receipt.error).toContain(code);
      expect(f.fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it('withholds a result belonging to another person', async () => {
    vi.useFakeTimers();
    const f = fixture('apollo-mobile');
    f.fetcher
      .mockResolvedValueOnce(
        Response.json({ request_id: '42', person: { id: 'person-1' } }),
      )
      .mockResolvedValueOnce(Response.json(apolloResult('42', 'other')));
    await f.run();
    tick();
    expect((await f.run()).receipt.error).toContain('matching');
  });
  it('does not confuse an organization number, direct dial or unknown line type with a mobile', () => {
    expect(
      apolloPhoneResult({
        organization: { phone: '+12025550123' },
        phone_numbers: [
          { ...phone, type_cd: 'work_direct' },
          { ...phone, type_cd: 'other' },
        ],
      }).pomade.mobile,
    ).toBe('');
  });
  it('preserves strings and other numeric fields, and rejects out-of-range IDs and invalid JSON', () => {
    expect(
      parseApolloJson(
        '{"request_id":-1039995589705121900,"count":2,"text":"request_id: 12"}',
      ),
    ).toEqual({
      request_id: '-1039995589705121900',
      count: 2,
      text: 'request_id: 12',
    });
    expect(apolloRequestId('9223372036854775808')).toBeUndefined();
    expect(apolloRequestId(1039995589705121900)).toBeUndefined();
    expect(() => parseApolloJson('{"count":1 2}')).toThrow();
  });
});
describe('new provider boundaries', () => {
  it.each(['dropcontact-email', 'apollo-mobile'])(
    'holds an uncertain %s submission and never submits again',
    async (id) => {
      vi.useFakeTimers();
      const f = fixture(id);
      f.fetcher.mockRejectedValue(new Error('connection lost'));
      expect((await f.run()).receipt.error).toContain('no request ID');
      tick();
      await f.run();
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('keeps callback configuration private and requires it only for Apollo phone', () => {
    const emailOnly = configuredHttpConnections({ APOLLO_API_KEY: 'secret' });
    expect(emailOnly.map((c) => c.id)).toContain('pomade_apollo_people');
    expect(emailOnly.map((c) => c.id)).not.toContain('pomade_apollo_phone');
    const all = configuredHttpConnections({
      APOLLO_API_KEY: 'secret',
      APOLLO_WEBHOOK_URL: 'https://callback.example.test/private-token',
      DROPCONTACT_API_KEY: 'other-secret',
    });
    expect(all.map((c) => c.id)).toContain('pomade_apollo_phone');
    expect(JSON.stringify(publicHttpConnections(all))).not.toMatch(
      /secret|private-token|callbackUrl/,
    );
  });
});
