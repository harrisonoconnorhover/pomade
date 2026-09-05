import { describe, it, expect, vi } from 'vitest';
import { createTable } from './workbook';
import {
  createApolloCompanyColumns,
  APOLLO_COMPANY_CONNECTION,
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
