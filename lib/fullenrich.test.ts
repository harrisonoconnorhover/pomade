import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asyncProviderFixture,
  closeAsyncProviderFixtures,
} from './async-provider.test-support';
import { executeProviderWaterfall } from './provider-waterfall';
import {
  FULLENRICH_PATH,
  FULLENRICH_POLL_INTERVAL_MS,
  FULLENRICH_WAIT_WINDOW_MS,
  fullEnrichContactResult,
} from './fullenrich';
import { configuredHttpConnections } from './provider-connections';
import { publicHttpConnections } from './http-enrichment';

const tick = () => vi.setSystemTime(Date.now() + FULLENRICH_POLL_INTERVAL_MS);
function fixture(id = 'fullenrich-email', surrounding = false) {
  const f = asyncProviderFixture(id, surrounding);
  const result = (
    contact_info: object = {},
    changes: Record<string, unknown> = {},
  ) => ({
    id: 'saved-enrichment',
    status: 'FINISHED',
    cost: { credits: 1 },
    data: [
      {
        custom: JSON.parse(
          f.fetcher.mock.calls.find(([, init]) => init?.method === 'POST')![1]
            ?.body as string,
        ).data[0].custom,
        contact_info,
      },
    ],
    ...changes,
  });
  return { ...f, result };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  closeAsyncProviderFixtures();
});

describe('FullEnrich v2 background enrichment', () => {
  it.each([
    [
      'fullenrich-email',
      { first_name: 'Ada', last_name: 'Example', domain: 'example.com' },
      'contact.work_emails',
      {
        most_probable_work_email: {
          email: 'ada@example.com',
          status: 'DELIVERABLE',
        },
      },
      'ada@example.com',
    ],
    [
      'fullenrich-personal',
      { linkedin_url: 'https://www.linkedin.com/in/ada-example' },
      'contact.personal_emails',
      {
        most_probable_personal_email: {
          email: 'ada@example.com',
          status: 'DELIVERABLE',
        },
      },
      'ada@example.com',
    ],
    [
      'fullenrich-mobile',
      { linkedin_url: 'https://www.linkedin.com/in/ada-example' },
      'contact.phones',
      {
        most_probable_phone: {
          number: '+1 202-555-0123',
          line_type: 'MOBILE',
          line_status: 'UNKNOWN',
        },
      },
      '+12025550123',
    ],
    [
      'fullenrich-verified-mobile',
      { linkedin_url: 'https://www.linkedin.com/in/ada-example' },
      'contact.phones',
      {
        most_probable_phone: {
          number: '+1 202-555-0123',
          line_type: 'MOBILE',
          line_status: 'ACTIVE',
          ownership_match: 'CONFIRMED',
        },
      },
      '+12025550123',
    ],
  ] as const)(
    'runs %s with only the selected contact type and resumes without duplicate charges',
    async (id, identifiers, field, contact, expected) => {
      vi.useFakeTimers();
      const f = fixture(id);
      f.fetcher
        .mockResolvedValueOnce(
          Response.json({ enrichment_id: 'saved-enrichment' }),
        )
        .mockImplementation(async () => Response.json(f.result(contact)));
      const submitted = await f.run();
      expect(submitted.receipt).toMatchObject({
        pending: true,
        httpRequestCount: 1,
        creditsConsumed: null,
      });
      expect(submitted.receipt.after).toBe('old@example.com');
      const [url, init] = f.fetcher.mock.calls[0];
      expect(url).toBe('https://app.fullenrich.com' + FULLENRICH_PATH);
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        'Bearer synthetic-private-key',
      );
      expect(JSON.parse(init?.body as string)).toEqual({
        name: 'Pomade contact lookup',
        data: [
          {
            ...identifiers,
            enrich_fields: [field],
            custom: { pomade_request: expect.any(String) },
          },
        ],
      });
      expect(JSON.stringify(submitted)).not.toContain('synthetic-private-key');
      vi.setSystemTime(Date.now() + FULLENRICH_POLL_INTERVAL_MS - 1);
      expect((await f.run()).receipt).toMatchObject({
        pending: true,
        httpRequestCount: 0,
      });
      vi.setSystemTime(Date.now() + 1);
      const completed = await f.run();
      expect(completed.receipt).toMatchObject({
        status: 'passed',
        after: expected,
        httpRequestCount: 1,
        creditsConsumed: 1,
      });
      expect(f.fetcher.mock.calls[1][0]).toBe(
        'https://app.fullenrich.com' + FULLENRICH_PATH + '/saved-enrichment',
      );
      expect(f.fetcher.mock.calls[1][1]).toMatchObject({
        method: 'GET',
        body: undefined,
      });
      const reused = await f.run();
      expect(reused.receipt).toMatchObject({
        status: 'passed',
        after: expected,
        httpRequestCount: 0,
        creditsConsumed: 0,
      });
      expect(f.fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it('holds fallback during partial results and reuses earlier steps after a completed miss', async () => {
    vi.useFakeTimers();
    const f = fixture('fullenrich-email', true);
    f.fetcher
      .mockResolvedValueOnce(Response.json({ email: '', status: 'invalid' }))
      .mockResolvedValueOnce(
        Response.json({ enrichment_id: 'saved-enrichment' }),
      )
      .mockImplementationOnce(async () =>
        Response.json(
          f.result(
            {
              most_probable_work_email: {
                email: 'partial@example.com',
                status: 'DELIVERABLE',
              },
            },
            { status: 'IN_PROGRESS', cost: { credits: 0 } },
          ),
        ),
      )
      .mockImplementationOnce(async () =>
        Response.json(f.result({}, { cost: { credits: 0 } })),
      )
      .mockResolvedValueOnce(
        Response.json({ email: 'ada@example.com', status: 'valid' }),
      );
    await f.run();
    tick();
    expect((await f.run()).receipt.pending).toBe(true);
    expect(f.fetcher).toHaveBeenCalledTimes(3);
    tick();
    const completed = await f.run();
    expect(completed.receipt.status).toBe('passed');
    expect(completed.receipt.attempts?.[0].cached).toBe(true);
    expect(f.fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
      'GET',
      'POST',
      'GET',
      'GET',
      'GET',
    ]);
    expect(completed.workspace.rows[0].values.result_provider).toBe('last');
  });
  it.each([
    'CANCELED',
    'CREDITS_INSUFFICIENT',
    'RATE_LIMIT',
    'UNKNOWN',
    'invented',
  ])(
    'keeps %s separate from no-match and does not count a repeated cumulative charge twice',
    async (status) => {
      vi.useFakeTimers();
      const f = fixture();
      f.column.providerWaterfall!.continueOnError = true;
      f.fetcher
        .mockResolvedValueOnce(
          Response.json({ enrichment_id: 'saved-enrichment' }),
        )
        .mockImplementation(async () =>
          Response.json(f.result({}, { status })),
        );
      await f.run();
      tick();
      const first = await f.run();
      expect(first.receipt.error).toContain('did not finish');
      expect(first.receipt.attempts?.[0].stopWaterfall).toBe(true);
      expect(first.receipt.creditsConsumed).toBe(1);
      tick();
      expect((await f.run()).receipt.creditsConsumed).toBe(0);
      expect(f.fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
        'POST',
        'GET',
        'GET',
      ]);
    },
  );
  it.each([
    { id: 'wrong-id' },
    { data: [] },
    { data: [{ custom: { pomade_request: 'wrong' } }] },
  ])('withholds mismatched result %j', async (changes) => {
    vi.useFakeTimers();
    const f = fixture();
    f.fetcher
      .mockResolvedValueOnce(
        Response.json({ enrichment_id: 'saved-enrichment' }),
      )
      .mockImplementation(async () => Response.json(f.result({}, changes)));
    await f.run();
    tick();
    expect((await f.run()).receipt.error).toMatch(/withheld/);
  });
  it('withholds conflicting echoed inputs despite a matching custom tag', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.fetcher
      .mockResolvedValueOnce(
        Response.json({ enrichment_id: 'saved-enrichment' }),
      )
      .mockImplementation(async () => {
        const data = f.result();
        return Response.json({
          ...data,
          data: [
            { ...data.data[0], input: { company_domain: 'different.test' } },
          ],
        });
      });
    await f.run();
    tick();
    expect((await f.run()).receipt.error).toContain(
      'conflicting contact inputs',
    );
  });
  it.each([{}, 'lost', 500])(
    'blocks resubmission after unknown submission %j',
    async (failure) => {
      const f = fixture();
      f.column.providerWaterfall!.continueOnError = true;
      f.fetcher.mockImplementation(async () => {
        if (failure === 'lost') throw new Error('network');
        return Response.json(failure, { status: failure === 500 ? 500 : 200 });
      });
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
    'can explicitly resume a known HTTP %s submission rejection',
    async (status) => {
      const f = fixture();
      f.fetcher
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(
          Response.json({ enrichment_id: 'saved-enrichment' }),
        );
      expect((await f.run()).receipt.error).toContain('lookup rejected');
      expect((await f.run()).receipt.pending).toBe(true);
    },
  );
  it.each([401, 429, 500])(
    'preserves the saved ID after polling HTTP %s',
    async (status) => {
      vi.useFakeTimers();
      const f = fixture();
      f.fetcher
        .mockResolvedValueOnce(
          Response.json({ enrichment_id: 'saved-enrichment' }),
        )
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockImplementation(async () => Response.json(f.result()));
      await f.run();
      tick();
      expect((await f.run()).receipt.error).toContain(
        'checking request saved-enrichment',
      );
      tick();
      expect((await f.run()).receipt.error).toBeUndefined();
      expect(f.fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
        'POST',
        'GET',
        'GET',
      ]);
    },
  );
  it('stops long waits for review and resumes the original ID', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.fetcher
      .mockResolvedValueOnce(
        Response.json({ enrichment_id: 'saved-enrichment' }),
      )
      .mockImplementation(async () => Response.json(f.result()));
    await f.run();
    vi.setSystemTime(Date.now() + FULLENRICH_WAIT_WINDOW_MS);
    expect((await f.run()).receipt.error).toContain('30 minutes');
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect((await f.run()).receipt.error).toBeUndefined();
    expect(f.fetcher.mock.calls[1][1]?.method).toBe('GET');
  });
  it('refuses immediate execution, missing identifiers and multi-type requests before submission', async () => {
    const f = fixture();
    await expect(
      executeProviderWaterfall(f.w, 'row', f.column, f.connections, f.fetcher),
    ).rejects.toThrow('background');
    f.w.rows[0].values.first_name = '';
    expect((await f.run()).receipt.error).toContain('Missing request input');
    expect(f.fetcher).not.toHaveBeenCalled();
    const mixed = fixture();
    const step = mixed.column.providerWaterfall!.steps[0];
    const body = JSON.parse(step.bodyTemplate!);
    body.data[0].enrich_fields.push('contact.phones');
    step.bodyTemplate = JSON.stringify(body);
    expect((await mixed.run()).receipt.error).toContain('exactly one');
    expect(mixed.fetcher).not.toHaveBeenCalled();
  });
  it('keeps credentials server-side and reserves the built-in connection ID', () => {
    expect(
      JSON.stringify(
        publicHttpConnections(
          configuredHttpConnections({ FULLENRICH_API_KEY: 'private-test' }),
        ),
      ),
    ).not.toContain('private-test');
    expect(() =>
      configuredHttpConnections({
        POMADE_HTTP_CONNECTIONS: JSON.stringify({
          pomade_fullenrich: { origin: 'https://other.test' },
        }),
      }),
    ).toThrow('reserved');
  });
});

describe('FullEnrich contact quality', () => {
  it.each([
    'HIGH_PROBABILITY',
    'CATCH_ALL',
    'INVALID',
    'INVALID_DOMAIN',
    undefined,
  ])('never upgrades email status %s to deliverable', (status) => {
    const output = fullEnrichContactResult(
      {
        contact_info: {
          most_probable_work_email: { email: 'ada@example.com', status },
        },
      },
      'contact.work_emails',
    );
    expect(output.pomade.email?.email).toBe('');
  });
  it('selects a deliverable email with its own status, without mixing personal and work candidates', () => {
    const output = fullEnrichContactResult(
      {
        contact_info: {
          most_probable_work_email: {
            email: 'bad@example.com',
            status: 'CATCH_ALL',
          },
          work_emails: [{ email: 'good@example.com', status: 'DELIVERABLE' }],
          most_probable_personal_email: {
            email: 'personal@example.com',
            status: 'DELIVERABLE',
          },
        },
      },
      'contact.work_emails',
    );
    expect(output.pomade.email).toEqual({
      email: 'good@example.com',
      status: 'DELIVERABLE',
    });
  });
  it.each([
    { line_type: 'LANDLINE' },
    { line_type: 'VOIP' },
    { line_type: 'UNKNOWN' },
    { line_status: 'INACTIVE' },
    { ownership_match: 'MISMATCH' },
    { number: '2025550123' },
  ])('withholds ineligible mobile %j', (changes) => {
    const output = fullEnrichContactResult(
      {
        contact_info: {
          most_probable_phone: {
            number: '+12025550123',
            line_type: 'MOBILE',
            line_status: 'ACTIVE',
            ownership_match: 'CONFIRMED',
            ...changes,
          },
        },
      },
      'contact.phones',
    );
    expect(output.pomade.phone?.number).toBe('');
  });
  it('keeps activity and ownership attached to the selected number', () => {
    const output = fullEnrichContactResult(
      {
        contact_info: {
          most_probable_phone: {
            number: '+12025550123',
            line_type: 'MOBILE',
            line_status: 'UNKNOWN',
          },
          phones: [
            {
              number: '+12025550124',
              line_type: 'MOBILE',
              line_status: 'ACTIVE',
              ownership_match: 'CONFIRMED',
            },
          ],
        },
      },
      'contact.phones',
    );
    expect(output.pomade.phone).toMatchObject({
      number: '+12025550124',
      verified: true,
    });
  });
  it('rejects unknown ownership in the strict mobile preset', async () => {
    vi.useFakeTimers();
    const f = fixture('fullenrich-verified-mobile');
    f.fetcher
      .mockResolvedValueOnce(
        Response.json({ enrichment_id: 'saved-enrichment' }),
      )
      .mockImplementation(async () =>
        Response.json(
          f.result({
            most_probable_phone: {
              number: '+12025550123',
              line_type: 'MOBILE',
              line_status: 'ACTIVE',
            },
          }),
        ),
      );
    await f.run();
    tick();
    expect((await f.run()).receipt.after).toBe('');
  });
});
