import { describe, it, expect, vi } from 'vitest';
import {
  CONTACT_PROVIDER_PRESETS,
  contactPreset,
  missingContactInputs,
  type ContactBindings,
} from './contact-provider-presets';
import { configuredHttpConnections } from './provider-connections';
import { publicHttpConnections } from './http-enrichment';
import { createTable } from './workbook';
import {
  createProviderWaterfall,
  executeProviderWaterfall,
} from './provider-waterfall';
import {
  createRecipeTemplate,
  instantiateRecipeTemplate,
} from './recipe-templates';

const bindings: ContactBindings = {
  person: 'person',
  domain: 'domain',
  email: 'work_email',
  profile: 'profile_url',
  phone: 'mobile',
};
function fixture(presetId: string, fallbackId?: string) {
  const w = createTable({
    id: 'test',
    name: 'Synthetic providers',
    mode: 'empty',
  });
  for (const id of Object.values(bindings))
    if (!w.columns.some((c) => c.id === id))
      w.columns.push({ id, title: id, kind: 'text', width: 180 });
  w.rows = [
    {
      id: 'a',
      values: {
        person: 'Ada Example',
        domain: 'example.com',
        work_email: 'ada@example.com',
        profile_url: 'https://www.linkedin.com/in/ada-example',
        mobile: '+12025550123',
      },
    },
  ];
  const preset = contactPreset(presetId)!;
  const columns = createProviderWaterfall(w, {
    id: 'result',
    title: 'Provider result',
    steps: [
      preset.step(bindings),
      ...(fallbackId ? [contactPreset(fallbackId)!.step(bindings)] : []),
    ],
    accept: preset.accept,
    continueOnError: false,
  });
  w.columns.push(...columns);
  return { w, column: columns[0] };
}
const connections = configuredHttpConnections({
  FINDYMAIL_API_KEY: 'private-fixture-key',
  HUNTER_API_KEY: 'private-hunter-key',
});
describe('Findymail documented contracts', () => {
  it.each([
    [
      'findymail',
      '/api/search/name',
      { name: 'Ada Example', domain: 'example.com' },
      { contact: { email: 'ada@example.com' } },
      'ada@example.com',
    ],
    [
      'findymail-phone',
      '/api/search/phone',
      { linkedin_url: 'https://www.linkedin.com/in/ada-example' },
      { phone: '+1 (202) 555-0123', line_type: 'Landline' },
      '+12025550123',
    ],
    [
      'findymail-verify',
      '/api/verify',
      { email: 'ada@example.com' },
      { email: 'ada@example.com', verified: true },
      'ada@example.com',
    ],
  ])(
    'maps %s without exposing credentials',
    async (id, path, body, data, expected) => {
      const { w, column } = fixture(id as string);
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async (input, init) => {
          expect(
            new URL(input instanceof Request ? input.url : input).href,
          ).toBe('https://app.findymail.com' + path);
          expect(new Headers(init?.headers).get('Authorization')).toBe(
            'Bearer private-fixture-key',
          );
          expect(JSON.parse(init?.body as string)).toEqual(body);
          return Response.json(data);
        });
      const result = await executeProviderWaterfall(
        w,
        'a',
        column,
        connections,
        fetcher,
      );
      expect(result.receipt.status).toBe('passed');
      expect(result.workspace.rows[0].values.result).toBe(expected);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain('private-fixture-key');
      expect(JSON.stringify(publicHttpConnections(connections))).not.toContain(
        'private-fixture-key',
      );
    },
  );
  it.each([false, null, 'unknown'])(
    'rejects verification %s and tries the next provider',
    async (verified) => {
      const { w, column } = fixture('findymail-verify', 'hunter');
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({ email: 'ada@example.com', verified }),
        )
        .mockResolvedValueOnce(
          Response.json({
            data: {
              email: 'ada@example.com',
              verification: { status: 'valid' },
            },
          }),
        );
      const result = await executeProviderWaterfall(
        w,
        'a',
        column,
        connections,
        fetcher,
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(result.workspace.rows[0].values.result_provider).toBe('Hunter');
      expect(result.receipt.attempts?.[0].status).toBe('review');
    },
  );
  it('treats a documented null phone as a miss, not a successful lookup', async () => {
    const { w, column } = fixture('findymail-phone');
    const result = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      async () => Response.json({ phone: null, line_type: null }),
    );
    expect(result.receipt.status).toBe('review');
    expect(result.receipt.error).toBeUndefined();
    expect(result.workspace.rows[0].values.result).toBe('');
    expect(column.providerWaterfall?.accept).toBe('phone');
  });
  it.each([200, 402, 423, 429])(
    'stops on account failures (HTTP %s), including application errors in a 200 body',
    async (status) => {
      const { w, column } = fixture('findymail-verify', 'hunter');
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ error: 'Not enough credits' }, { status }),
        );
      const result = await executeProviderWaterfall(
        w,
        'a',
        column,
        connections,
        fetcher,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result.receipt.error).toBeTruthy();
      expect(result.workspace.rows[0].values.result).toBe('');
    },
  );
});
describe('credential-free preset preparation', () => {
  it.each(CONTACT_PROVIDER_PRESETS.map((p) => [p.id]))(
    'saves and remaps %s without a key and makes no unconfigured request',
    async (id) => {
      const { w, column } = fixture(id);
      expect(
        missingContactInputs(contactPreset(id)!, bindings, w.columns),
      ).toEqual([]);
      const template = createRecipeTemplate(column, w.columns, {
        id: 'portable',
        name: 'Portable',
      });
      const copy = instantiateRecipeTemplate(
        template,
        w.columns,
        Object.fromEntries(Object.values(bindings).map((key) => [key, key])),
      )[0];
      expect(copy.providerWaterfall?.steps).toEqual(
        column.providerWaterfall?.steps,
      );
      const fetcher = vi.fn<typeof fetch>();
      const result = await executeProviderWaterfall(
        w,
        'a',
        column,
        [],
        fetcher,
      );
      expect(fetcher).not.toHaveBeenCalled();
      expect(result.receipt.error).toContain('not configured');
    },
  );
});

describe('independent email validators', () => {
  const connections = configuredHttpConnections({
    HUNTER_API_KEY: 'secret-hunter',
    LEADMAGIC_API_KEY: 'secret-leadmagic',
    ZEROBOUNCE_API_KEY: 'secret-zero&+?',
  });
  it.each([
    [
      'hunter-verify',
      { data: { email: 'ada@example.com', status: 'valid' } },
      'https://api.hunter.io/v2/email-verifier',
    ],
    [
      'leadmagic-verify',
      { email: 'ada@example.com', email_status: 'valid' },
      'https://api.leadmagic.io/v1/people/email-validation',
    ],
    [
      'zerobounce-verify',
      { address: 'ada@example.com', status: 'valid' },
      'https://api.zerobounce.net/v2/validate',
    ],
  ])('accepts the documented %s result', async (id, data, endpoint) => {
    const { w, column } = fixture(id as string);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        expect(url.origin + url.pathname).toBe(endpoint);
        if (id === 'zerobounce-verify') {
          expect(url.searchParams.get('api_key')).toBe('secret-zero&+?');
          expect(url.searchParams.get('email')).toBe('ada@example.com');
          expect(url.searchParams.get('activity_data')).toBe('false');
          expect(url.searchParams.get('verify_plus')).toBe('false');
        } else if (id === 'leadmagic-verify') {
          expect(JSON.parse(init?.body as string)).toEqual({
            email: 'ada@example.com',
          });
          expect(new Headers(init?.headers).get('X-API-Key')).toBe(
            'secret-leadmagic',
          );
        } else
          expect(new Headers(init?.headers).get('X-API-KEY')).toBe(
            'secret-hunter',
          );
        return Response.json(data);
      });
    const result = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      fetcher,
    );
    expect(result.receipt.status).toBe('passed');
    expect(result.workspace.rows[0].values.result).toBe('ada@example.com');
    expect(JSON.stringify(result)).not.toContain('secret-');
    expect(JSON.stringify(column)).not.toContain('secret-');
    expect(JSON.stringify(publicHttpConnections(connections))).not.toContain(
      'secret-',
    );
  });
  it.each([
    'invalid',
    'unknown',
    'catch-all',
    'spamtrap',
    'abuse',
    'do_not_mail',
  ])(
    'rejects ZeroBounce %s without outputting a contactable email',
    async (status) => {
      const { w, column } = fixture('zerobounce-verify');
      const result = await executeProviderWaterfall(
        w,
        'a',
        column,
        connections,
        async () => Response.json({ address: 'ada@example.com', status }),
      );
      expect(result.receipt.status).toBe('review');
      expect(result.workspace.rows[0].values.result).toBe('');
    },
  );
  it.each([202, 222])(
    'stops on Hunter HTTP %s without calling another paid provider',
    async (status) => {
      const { w, column } = fixture('hunter-verify', 'zerobounce-verify');
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ data: { status: 'pending' } }, { status }),
        );
      const result = await executeProviderWaterfall(
        w,
        'a',
        column,
        connections,
        fetcher,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result.receipt.error).toContain('Hunter');
    },
  );
  it('does not turn a ZeroBounce HTTP-200 credit failure into a miss', async () => {
    const { w, column } = fixture('zerobounce-verify', 'hunter-verify');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        error: 'Invalid API Key or your account ran out of credits',
      }),
    );
    const result = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.receipt.error).toContain('ZeroBounce rejected');
  });
});

describe('Trestle phone validity', () => {
  const connections = configuredHttpConnections({
    TRESTLE_API_KEY: 'private-trestle',
  });
  it('matches national output to the submitted international number without inventing activity or mobile status', async () => {
    const { w, column } = fixture('trestle-verify');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        expect(url.origin + url.pathname).toBe(
          'https://api.trestleiq.com/3.0/phone_intel',
        );
        expect(url.searchParams.get('phone')).toBe('+12025550123');
        expect(url.searchParams.has('add_ons')).toBe(false);
        expect(new Headers(init?.headers).get('x-api-key')).toBe(
          'private-trestle',
        );
        return Response.json({
          phone_number: '2025550123',
          country_calling_code: '1',
          is_valid: true,
          line_type: 'Landline',
          activity_score: 50,
        });
      });
    const result = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      fetcher,
    );
    expect(result.receipt.status).toBe('passed');
    expect(result.workspace.rows[0].values.result).toBe('+12025550123');
    expect(JSON.stringify(result)).not.toContain('private-trestle');
  });
  it.each([
    { phone_number: '+12025550123', is_valid: false },
    { phone_number: '+12025550123', is_valid: null },
    { phone_number: '2025550123', is_valid: true },
    { phone_number: '+12025550999', is_valid: true },
    {
      phone_number: '+12025550123',
      is_valid: true,
      error: { name: 'InternalError' },
    },
  ])(
    'withholds an invalid, unmatched or incomplete response %#',
    async (data) => {
      const { w, column } = fixture('trestle-verify');
      const result = await executeProviderWaterfall(
        w,
        'a',
        column,
        connections,
        async () => Response.json(data),
      );
      expect(result.receipt.status).toBe('review');
      expect(result.workspace.rows[0].values.result).toBe('');
    },
  );
});
