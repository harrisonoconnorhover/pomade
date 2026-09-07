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
  first_name: 'first_name',
  last_name: 'last_name',
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
        first_name: 'Ada',
        last_name: 'Example',
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

describe('People Data Labs person fields', () => {
  const connections = configuredHttpConnections({
    PDL_API_KEY: 'private-pdl',
    HUNTER_API_KEY: 'private-hunter',
  }).map((c) => ({ ...c, requestDelayMs: 0 }));
  it.each([
    ['pdl-email', 'work_email', 'ada@example.com'],
    ['pdl-mobile', 'mobile_phone', '+12025550123'],
  ])('requests only the required %s field', async (id, field, value) => {
    const { w, column } = fixture(id);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        expect(url.origin + url.pathname).toBe(
          'https://api.peopledatalabs.com/v5/person/enrich',
        );
        expect(url.searchParams.get('required')).toBe(field);
        expect(url.searchParams.get('data_include')).toBe(field);
        expect(url.searchParams.get('profile')).toBe(
          w.rows[0].values.profile_url,
        );
        expect(new Headers(init?.headers).get('X-API-Key')).toBe('private-pdl');
        return Response.json({
          status: 200,
          likelihood: 10,
          data: { [field]: value },
        });
      });
    const result = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      fetcher,
    );
    expect(result.workspace.rows[0].values.result).toBe(value);
    expect(result.receipt.status).toBe('passed');
    expect(column.providerWaterfall?.accept).not.toContain('verified');
  });
  it('falls back for a documented 404, but withholds a low-confidence match', async () => {
    const { w, column } = fixture('pdl-email', 'hunter');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: 404 }, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({ data: { email: 'ada@example.com' } }),
      );
    const result = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      fetcher,
    );
    expect(result.workspace.rows[0].values.result_provider).toBe('Hunter');
    expect(result.receipt.attempts?.[0].error).toBeUndefined();
    const bad = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      async () =>
        Response.json({
          status: 200,
          likelihood: 2,
          data: { work_email: 'wrong@example.com' },
        }),
    );
    expect(bad.receipt.error).toContain('confidence');
    expect(bad.workspace.rows[0].values.result).toBe('');
  });
});

it('does not mistake PDL free-plan availability flags for revealed contact data', async () => {
  const { w, column } = fixture('pdl-email', 'hunter');
  const connections = configuredHttpConnections({ PDL_API_KEY: 'fixture' }).map(
    (c) => ({ ...c, requestDelayMs: 0 }),
  );
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      status: 200,
      likelihood: 10,
      data: { work_email: true },
    }),
  );
  const result = await executeProviderWaterfall(
    w,
    'a',
    column,
    connections,
    fetcher,
  );
  expect(result.workspace.rows[0].values.result).toBe('');
  expect(result.receipt.error).toContain('plan did not reveal');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

describe('ContactOut contact-type selection', () => {
  const connections = configuredHttpConnections({
    CONTACTOUT_API_KEY: 'private-contactout',
    HUNTER_API_KEY: 'private-hunter',
  });
  it('uses the verification status for the chosen email and never requests a phone for email lookup', async () => {
    const { w, column } = fixture('contactout-email', 'hunter');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        expect(url.origin + url.pathname).toBe(
          'https://api.contactout.com/v1/people/linkedin',
        );
        expect(url.searchParams.get('include_phone')).toBe('false');
        expect(url.searchParams.get('email_type')).toBe('work');
        expect(new Headers(init?.headers).get('token')).toBe(
          'private-contactout',
        );
        return Response.json({
          status_code: 200,
          profile: {
            url: w.rows[0].values.profile_url,
            work_email: ['uncertain@example.com', 'ada@example.com'],
            work_email_status: {
              'uncertain@example.com': 'Unverified',
              'ada@example.com': 'Verified',
            },
          },
        });
      });
    const result = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      fetcher,
    );
    expect(result.workspace.rows[0].values.result).toBe('ada@example.com');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('private-contactout');
  });
  it.each([
    [
      'contactout-phone',
      'none',
      'true',
      { phone: ['2025550123', '+12025550123'] },
      '+12025550123',
    ],
    [
      'contactout-personal',
      'personal',
      'false',
      { personal_email: ['ada@example.com'] },
      'ada@example.com',
    ],
  ])(
    'requests only %s contact data',
    async (id, emailType, includePhone, profile, expected) => {
      const { w, column } = fixture(id as string);
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async (input) => {
          const url = new URL(input instanceof Request ? input.url : input);
          expect(url.searchParams.get('include_phone')).toBe(includePhone);
          expect(url.searchParams.get('email_type')).toBe(emailType);
          return Response.json({ status_code: 200, profile });
        });
      const result = await executeProviderWaterfall(
        w,
        'a',
        column,
        connections,
        fetcher,
      );
      expect(result.workspace.rows[0].values.result).toBe(expected);
    },
  );
  it('rejects mismatched profiles, ignores unverified emails, and falls through on not-found', async () => {
    const { w, column } = fixture('contactout-email');
    for (const profile of [
      {
        url: 'https://linkedin.com/in/wrong-person',
        work_email: ['ada@example.com'],
        work_email_status: { 'ada@example.com': 'Verified' },
      },
      {
        work_email: ['ada@example.com'],
        work_email_status: { 'other@example.com': 'Verified' },
      },
    ]) {
      const result = await executeProviderWaterfall(
        w,
        'a',
        column,
        connections,
        async () => Response.json({ status_code: 200, profile }),
      );
      expect(result.workspace.rows[0].values.result).toBe('');
    }
    const { w: next, column: waterfall } = fixture(
      'contactout-email',
      'hunter',
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { status_code: 404, message: 'Not Found' },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: { email: 'ada@example.com', verification: { status: 'valid' } },
        }),
      );
    const result = await executeProviderWaterfall(
      next,
      'a',
      waterfall,
      connections,
      fetcher,
    );
    expect(result.workspace.rows[0].values.result_provider).toBe('Hunter');
  });
});

describe('Upcell enrichment', () => {
  const connections = configuredHttpConnections({
    UPCELL_API_KEY: 'private-upcell',
  });
  it.each([
    [
      'upcell-email',
      '/v1/enrich/email',
      { firstName: 'Ada', lastName: 'Example', companyDomain: 'example.com' },
      { email: 'ada@example.com', verified: true },
      'ada@example.com',
    ],
    [
      'upcell-mobile',
      '/v1/enrich/contact',
      {
        linkedinUrl: 'https://www.linkedin.com/in/ada-example',
        fields: ['mobile'],
      },
      { contact: { mobilePhone: '+12025550123' } },
      '+12025550123',
    ],
  ])(
    'implements %s with raw Authorization authentication',
    async (id, path, body, data, expected) => {
      const { w, column } = fixture(id as string);
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async (input, init) => {
          expect(
            new URL(input instanceof Request ? input.url : input).href,
          ).toBe('https://api.upcell.io' + path);
          expect(new Headers(init?.headers).get('Authorization')).toBe(
            'private-upcell',
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
      expect(result.workspace.rows[0].values.result).toBe(expected);
      expect(result.receipt.status).toBe('passed');
    },
  );
  it('does not accept unverified email or request enrichment with a missing surname', async () => {
    const { w, column } = fixture('upcell-email');
    const result = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      async () => Response.json({ email: 'ada@example.com', verified: false }),
    );
    expect(result.workspace.rows[0].values.result).toBe('');
    w.rows[0].values.last_name = '';
    const fetcher = vi.fn<typeof fetch>();
    await executeProviderWaterfall(w, 'a', column, connections, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
