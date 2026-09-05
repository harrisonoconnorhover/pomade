import { describe, expect, it, vi } from 'vitest';
import { createTable } from './workbook';
import {
  createHttpColumns,
  executeHttpRecipe,
  httpConnections,
  prepareHttpRequest,
  publicHttpConnections,
} from './http-enrichment';
import {
  createRecipeTemplate,
  instantiateRecipeTemplate,
} from './recipe-templates';
import { summarizeRecentUsage } from './usage-summary';
import { executeRecipePipeline } from './recipe-pipeline';

const connections = httpConnections(
  JSON.stringify({
    demo: {
      origin: 'https://api.example.com',
      methods: ['GET', 'POST'],
      headers: { Authorization: 'Bearer secret' },
    },
  }),
);
function fixture(method: 'GET' | 'POST' = 'GET') {
  const workspace = createTable({ id: 'test', name: 'Test', mode: 'empty' });
  workspace.rows = [
    {
      id: 'r1',
      values: {
        company: 'Example',
        domain: 'example.com',
        person: 'Ada "A" & Bob/Junior',
      },
    },
  ];
  const columns = createHttpColumns(workspace, {
    id: 'http',
    title: 'API value',
    connectionId: 'demo',
    method,
    pathTemplate: '/v1/person?name={{person}}',
    bodyTemplate: '{"name":"{{person}}","nested":{"enabled":true}}',
    outputs: [
      { title: 'Value', path: 'data.0.value' },
      { title: 'Active', path: 'active' },
    ],
  });
  workspace.columns.splice(-1, 0, ...columns);
  return { workspace, columns };
}

describe('HTTP enrichment', () => {
  it('exposes only connection metadata and safely interpolates URL and JSON values', () => {
    const { workspace, columns } = fixture('POST');
    const request = prepareHttpRequest(
      columns[0],
      workspace.rows[0],
      connections[0],
    );
    expect(new URL(request.url).searchParams.get('name')).toBe(
      workspace.rows[0].values.person,
    );
    expect(JSON.parse(request.init.body!)).toEqual({
      name: workspace.rows[0].values.person,
      nested: { enabled: true },
    });
    expect(request.init.headers.get('Authorization')).toBe('Bearer secret');
    expect(JSON.stringify(publicHttpConnections(connections))).not.toContain(
      'secret',
    );
    expect(JSON.stringify(columns)).not.toContain('secret');
  });
  it('keeps credentials on the configured origin and refuses disabled methods', () => {
    const { workspace, columns } = fixture();
    columns[0].http!.pathTemplate = '//other.example/steal';
    expect(() =>
      prepareHttpRequest(columns[0], workspace.rows[0], connections[0]),
    ).toThrow();
    columns[0].http!.pathTemplate = '/\\other.example/steal';
    expect(() =>
      prepareHttpRequest(columns[0], workspace.rows[0], connections[0]),
    ).toThrow();
    const post = fixture('POST');
    expect(() =>
      prepareHttpRequest(post.columns[0], post.workspace.rows[0], {
        ...connections[0],
        methods: ['GET'],
      }),
    ).toThrow('not enabled');
  });
  it('maps numeric and boolean JSON values without treating zero or false as missing', async () => {
    const { workspace, columns } = fixture();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: [{ value: 0 }], active: false }),
      );
    const result = await executeHttpRecipe(
      workspace,
      'r1',
      columns[0],
      connections,
      fetcher,
    );
    expect(result.workspace.rows[0].values).toMatchObject({
      http: '0',
      http_1: 'false',
      http_status: 'Complete',
    });
    expect(result.receipt).toMatchObject({
      status: 'passed',
      provider: 'http',
      creditsConsumed: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('clears stale mapped outputs for HTTP errors, redirects, invalid JSON and missing paths without retrying', async () => {
    const { workspace, columns } = fixture();
    workspace.rows[0].values.http = 'stale';
    for (const response of [
      new Response('secret body', { status: 429 }),
      new Response(null, {
        status: 302,
        headers: { Location: 'https://evil.example' },
      }),
      new Response('not-json'),
      Response.json({}),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      const result = await executeHttpRecipe(
        workspace,
        'r1',
        columns[0],
        connections,
        fetcher,
      );
      expect(result.receipt.status).toBe('review');
      expect(result.workspace.rows[0].values.http).toBe('');
      expect(JSON.stringify(result.receipt)).not.toContain('secret body');
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('makes no request for missing inputs/connections and records uncertain network failures', async () => {
    const { workspace, columns } = fixture();
    const fetcher = vi.fn<typeof fetch>();
    expect(
      (await executeHttpRecipe(workspace, 'r1', columns[0], [], fetcher))
        .receipt.provider,
    ).toBe('local');
    workspace.rows[0].values.person = '';
    expect(
      (
        await executeHttpRecipe(
          workspace,
          'r1',
          columns[0],
          connections,
          fetcher,
        )
      ).receipt.status,
    ).toBe('review');
    expect(fetcher).not.toHaveBeenCalled();
    workspace.rows[0].values.person = 'Ada';
    fetcher.mockRejectedValue(new Error('sensitive low-level failure'));
    const result = await executeHttpRecipe(
      workspace,
      'r1',
      columns[0],
      connections,
      fetcher,
    );
    expect(result.receipt.provider).toBe('http');
    expect(JSON.stringify(result)).not.toContain('sensitive');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds response size and keeps unknown provider cost in usage reporting', async () => {
    const { workspace } = fixture();
    const result = await executeRecipePipeline(
      workspace,
      undefined,
      ['http'],
      {},
      (table, rowId, column) =>
        executeHttpRecipe(
          table,
          rowId,
          column,
          connections,
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response('x'.repeat(1_048_577))),
        ),
    );
    expect(result.run.receipts[0].status).toBe('review');
    expect(result.run.externalWrites).toBe('unknown');
    expect(summarizeRecentUsage([result.run])).toMatchObject({
      providerActionCount: 1,
      unreportedProviderActionCount: 1,
      providerActions: { http: 1 },
    });
  });
  it('remaps HTTP template inputs and output paths without copying credentials', () => {
    const { workspace, columns } = fixture();
    const template = createRecipeTemplate(columns[0], workspace.columns, {
      id: 'template',
      name: 'API',
    });
    const added = instantiateRecipeTemplate(template, workspace.columns, {
      person: 'company',
    });
    expect(added[0].http!.outputs[0].outputColumnId).toBe(added[0].id);
    expect(added[0].http!.statusColumnId).toBe(added[2].id);
    expect(
      new URL(
        prepareHttpRequest(added[0], workspace.rows[0], connections[0]).url,
      ).searchParams.get('name'),
    ).toBe('Example');
  });
});
