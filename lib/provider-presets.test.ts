import { describe, it, expect, vi } from 'vitest';
import { createTable } from './workbook';
import {
  createApolloCompanyColumns,
  APOLLO_COMPANY_CONNECTION,
  createPdlCompanyColumns,
  emailProviderStep,
} from './provider-presets';
import { configuredHttpConnections } from './provider-connections';
import {
  executeHttpRecipe,
  prepareHttpRequest,
  publicHttpConnections,
} from './http-enrichment';
import {
  createRecipeTemplate,
  instantiateRecipeTemplate,
} from './recipe-templates';
const connections = configuredHttpConnections({
  APOLLO_API_KEY: 'fixture-secret',
});
function fixture() {
  const w = createTable({ id: 'w', name: 'Preset', mode: 'empty' });
  w.rows = [{ id: 'one', values: { domain: 'https://www.example.com/about' } }];
  const columns = createApolloCompanyColumns(w, 'domain');
  w.columns.splice(-1, 0, ...columns);
  return { w, columns };
}
const response = () =>
  Response.json({
    organization: {
      name: 'Example',
      primary_domain: 'example.com',
      industry: 'Software',
      estimated_num_employees: 42,
    },
  });
describe('Apollo company preset', () => {
  it('keeps the key in the server connection and sends a normalized GET request', async () => {
    const { w, columns } = fixture();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        expect(url.origin).toBe('https://api.apollo.io');
        expect(url.pathname).toBe('/api/v1/organizations/enrich');
        expect(url.searchParams.get('domain')).toBe('example.com');
        expect(new Headers(init?.headers).get('x-api-key')).toBe(
          'fixture-secret',
        );
        expect(init?.redirect).toBe('manual');
        return response();
      });
    const result = await executeHttpRecipe(
      w,
      'one',
      columns[0],
      connections,
      fetcher,
    );
    expect(result.receipt.status).toBe('passed');
    expect(result.receipt.provider).toBe('apollo');
    expect(result.receipt.creditsConsumed).toBeNull();
    expect(result.workspace.rows[0].values[columns[3].id]).toBe('42');
    expect(columns[3].valueType).toBe('number');
    expect(JSON.stringify(columns)).not.toContain('fixture-secret');
    expect(JSON.stringify(publicHttpConnections(connections))).not.toContain(
      'fixture-secret',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('withholds mismatched results and does not send blank or invalid inputs', async () => {
    const { w, columns } = fixture();
    w.rows[0].values[columns[0].id] = 'Stale';
    const mismatch = await executeHttpRecipe(
      w,
      'one',
      columns[0],
      connections,
      async () =>
        Response.json({
          organization: { name: 'Wrong', primary_domain: 'other.com' },
        }),
    );
    expect(mismatch.receipt.error).toContain('no matching domain');
    expect(mismatch.workspace.rows[0].values[columns[0].id]).toBe('');
    const fetcher = vi.fn<typeof fetch>();
    w.rows[0].values.domain = 'person@example.com';
    const skipped = await executeHttpRecipe(
      w,
      'one',
      columns[0],
      connections,
      fetcher,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(skipped.receipt.creditsConsumed).toBe(0);
  });
  it('remaps preset inputs and preserves identity checks in reusable templates', () => {
    const { w, columns } = fixture();
    const template = createRecipeTemplate(columns[0], w.columns, {
      id: 't',
      name: 'Company',
    });
    const target = createTable({ id: 'other', name: 'Other', mode: 'empty' });
    const [copy] = instantiateRecipeTemplate(template, target.columns, {
      domain: 'company',
    });
    const request = prepareHttpRequest(
      copy,
      { id: 'one', values: { company: 'https://www.example.com/path' } },
      connections[0],
    );
    expect(new URL(request.url).searchParams.get('domain')).toBe('example.com');
    expect(copy.http?.preset).toBe('apollo-company');
    expect(copy.http?.presetInputKey).toBe('domain');
  });
  it('exposes missing fields and blocks altered preset endpoints before sending', async () => {
    const { w, columns } = fixture();
    const result = await executeHttpRecipe(
      w,
      'one',
      columns[0],
      connections,
      async () =>
        Response.json({
          organization: { name: 'Example', primary_domain: 'example.com' },
        }),
    );
    expect(result.receipt.status).toBe('review');
    expect(
      result.workspace.rows[0].values[columns[0].http!.statusColumnId],
    ).toContain('Missing response fields');
    columns[0].http!.pathTemplate = '/other';
    const fetcher = vi.fn<typeof fetch>();
    await executeHttpRecipe(w, 'one', columns[0], connections, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not expose an unconfigured preset connection or permit reserved-ID shadowing', () => {
    expect(configuredHttpConnections({})).toEqual([]);
    expect(() =>
      configuredHttpConnections({
        POMADE_HTTP_CONNECTIONS: JSON.stringify({
          [APOLLO_COMPANY_CONNECTION]: { origin: 'https://other.example' },
        }),
        APOLLO_API_KEY: 'fixture-secret',
      }),
    ).toThrow('reserved');
  });
});

describe('expanded company and verified email presets', () => {
  it('maps rich Apollo fields in one call without filling missing fields with guesses', async () => {
    const w = createTable({ id: 'w', name: 'Rich data', mode: 'empty' });
    w.rows = [{ id: 'one', values: { domain: 'example.com' } }];
    const columns = createApolloCompanyColumns(w, 'domain', true);
    w.columns.push(...columns);
    const f = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        organization: {
          primary_domain: 'example.com',
          name: 'Example',
          estimated_num_employees: 100,
          annual_revenue_printed: '10M-50M',
          annual_revenue: 25000000,
          country: 'United States',
          technology_names: ['HubSpot', 'React'],
          funding_events: [{ date: '2025-01-01', type: 'Series A' }],
        },
      }),
    );
    const result = await executeHttpRecipe(
      w,
      'one',
      columns[0],
      connections,
      f,
    );
    expect(f).toHaveBeenCalledTimes(1);
    expect(result.workspace.rows[0].values[columns[4].id]).toBe('10M-50M');
    expect(result.workspace.rows[0].values[columns[12].id]).toBe('25000000');
    expect(columns[12].valueType).toBe('number');
    expect(result.workspace.rows[0].values[columns[11].id]).toBe(
      '["HubSpot","React"]',
    );
    expect(result.receipt.status).toBe('review');
    expect(result.workspace.rows[0].values[columns[8].id]).toBe('');
  });
  it('keeps Hunter verification mapping and all optional credentials server-side', () => {
    expect(emailProviderStep('hunter')).toMatchObject({
      responsePath: 'data.email',
      verification: {
        path: 'data.verification.status',
        acceptedValues: ['valid'],
      },
    });
    expect(emailProviderStep('apollo')).toMatchObject({
      responsePath: 'person.email',
      verification: {
        path: 'person.email_status',
        acceptedValues: ['verified'],
      },
    });
    const configured = configuredHttpConnections({
      HUNTER_API_KEY: 'hunter-secret',
      PDL_API_KEY: 'pdl-secret',
    });
    expect(configured).toHaveLength(2);
    expect(JSON.stringify(publicHttpConnections(configured))).not.toContain(
      'secret',
    );
  });
  it('checks the PDL domain and maps its own schema, including employee numbers', async () => {
    const w = createTable({ id: 'w', name: 'PDL', mode: 'empty' });
    w.rows = [{ id: 'one', values: { domain: 'https://www.example.com/' } }];
    const columns = createPdlCompanyColumns(w, 'domain');
    w.columns.push(...columns);
    const configured = configuredHttpConnections({
      PDL_API_KEY: 'fixture-secret',
    });
    const f = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      expect(
        new URL(input instanceof Request ? input.url : input).searchParams.get(
          'website',
        ),
      ).toBe('example.com');
      return Response.json({
        name: 'Example',
        website: 'example.com',
        employee_count: 70,
        location: { name: 'boston' },
      });
    });
    const result = await executeHttpRecipe(w, 'one', columns[0], configured, f);
    expect(result.workspace.rows[0].values[columns[3].id]).toBe('70');
  });
});

it('retains complete technology sets larger than a short text cell', async () => {
  const w = createTable({ id: 't', name: 'Technologies', mode: 'empty' });
  w.rows = [{ id: 'one', values: { domain: 'example.com' } }];
  const columns = createApolloCompanyColumns(w, 'domain', true);
  w.columns.push(...columns);
  const technologies = Array.from({ length: 500 }, (_, i) => `Technology ${i}`);
  const result = await executeHttpRecipe(
    w,
    'one',
    columns[0],
    connections,
    async () =>
      Response.json({
        organization: {
          primary_domain: 'example.com',
          technology_names: technologies,
        },
      }),
  );
  expect(JSON.parse(result.workspace.rows[0].values[columns[11].id])).toEqual(
    technologies,
  );
});

describe('Prospeo verified email preset', () => {
  it('accepts verified email, rejects catch-all, and never requests mobile reveal', async () => {
    const { createProviderWaterfall, executeProviderWaterfall } =
      await import('./provider-waterfall');
    const w = createTable({ id: 'prospeo', name: 'Prospeo', mode: 'empty' });
    w.rows = [
      { id: 'one', values: { person: 'Test Person', domain: 'example.com' } },
    ];
    const step = emailProviderStep('prospeo');
    const columns = createProviderWaterfall(w, {
      id: 'verified_email',
      title: 'Verified email',
      steps: [step, emailProviderStep('hunter')],
      accept: 'verified-email',
      continueOnError: false,
    });
    w.columns.push(...columns);
    const connections = configuredHttpConnections({
      PROSPEO_API_KEY: 'fixture-secret',
      HUNTER_API_KEY: 'fixture-hunter',
    }).map((c) => ({ ...c, requestDelayMs: 0 }));
    const f = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      expect(input instanceof Request ? input.url : input.toString()).toBe(
        'https://api.prospeo.io/enrich-person',
      );
      expect(new Headers(init?.headers).get('X-KEY')).toBe('fixture-secret');
      expect(
        JSON.parse(typeof init?.body === 'string' ? init.body : ''),
      ).toEqual({
        only_verified_email: true,
        enrich_mobile: false,
        data: { full_name: 'Test Person', company_website: 'example.com' },
      });
      return Response.json({
        person: {
          email: {
            status: 'VERIFIED',
            revealed: true,
            email: 'test@example.com',
          },
        },
      });
    });
    const ok = await executeProviderWaterfall(
      w,
      'one',
      columns[0],
      connections,
      f,
    );
    expect(ok.receipt.status).toBe('passed');
    expect(ok.workspace.rows[0].values.verified_email).toBe('test@example.com');
    const fallback = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: true, error_code: 'NO_MATCH' }, { status: 400 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            email: 'test@example.com',
            verification: { status: 'valid' },
          },
        }),
      );
    const missed = await executeProviderWaterfall(
      w,
      'one',
      columns[0],
      connections,
      fallback,
    );
    expect(missed.receipt.status).toBe('passed');
    expect(missed.receipt.attempts?.[0].error).toBeUndefined();
    expect(missed.workspace.rows[0].values.verified_email_provider).toBe(
      'Hunter',
    );
    const uncertain = await executeProviderWaterfall(
      w,
      'one',
      columns[0],
      connections,
      async () =>
        Response.json({
          person: { email: { status: 'CATCH_ALL', email: 'test@example.com' } },
        }),
    );
    expect(uncertain.workspace.rows[0].values.verified_email).toBe('');
    expect(uncertain.receipt.status).toBe('review');
    expect(JSON.stringify(publicHttpConnections(connections))).not.toContain(
      'fixture-secret',
    );
  });
});
