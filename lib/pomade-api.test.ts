import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { manageApiKey } from '../scripts/pomade-api-key.mjs';
import { createPomadeMcp, pomadeApiClient } from '../scripts/pomade-mcp.mjs';
import {
  authenticatePomadeApi,
  apiErrorResponse,
  type PomadeApiKey,
} from './pomade-api-auth';
import {
  apiCatalog,
  callPomadeTool,
  type PomadeApiBackend,
} from './pomade-api';
import { createTable, summarizeTable } from './workbook';
import type { RunReceipt } from './pomade-types';

const token = 'pomade_' + 'x'.repeat(55);
const key: PomadeApiKey = {
  id: 'key1',
  name: 'Test',
  sha256: createHash('sha256').update(token).digest('hex'),
  scopes: ['read', 'run', 'crm:read', 'crm:write'],
};
const config = JSON.stringify([key]);
const request = (
  credential = token,
  origin = 'http://127.0.0.1:8798',
  headers = {},
) =>
  new Request(origin + '/api/v1', {
    headers: { Authorization: `Bearer ${credential}`, ...headers },
  });
function fixture() {
  const w = createTable({ id: 'accounts', name: 'Accounts', mode: 'empty' });
  w.columns.push(
    { id: 'headcount', title: 'Headcount', kind: 'text', width: 100 },
    {
      id: 'summary',
      title: 'Research',
      kind: 'enrichment',
      recipe: 'web-research',
      width: 200,
      prompt: 'Research {{company}}',
    },
  );
  w.rows = [
    {
      id: 'a',
      values: {
        company: 'HealthEdge',
        domain: 'healthedge.com',
        headcount: '100',
      },
    },
    {
      id: 'b',
      values: {
        company: 'Clearwater',
        domain: 'clearwatersecurity.com',
        headcount: '25',
      },
    },
    {
      id: 'c',
      values: { company: 'Solera', domain: 'solera.com', headcount: '' },
    },
  ];
  w.crmMappings = [
    {
      id: 'hubspot',
      name: 'HubSpot',
      config: {
        provider: 'hubspot',
        objectType: 'company',
        mapping: { name: 'company', domain: 'domain' },
      },
    },
  ];
  const backend: PomadeApiBackend = {
    listTables: vi.fn(async () => [summarizeTable(w)]),
    loadTable: vi.fn(async (id) => (id === w.id ? w : null)),
    runRecipe: vi.fn(async () => ({
      workspace: w,
      run: { id: 'run1' } as RunReceipt,
    })),
    listRuns: vi.fn(async () => ({ runs: [] })),
    readCrm: vi.fn(async () => ({ preview: { contacts: [] } })),
    previewCrm: vi.fn(async () => ({ plan: { id: 'plan1', actions: [] } })),
    getCrmPlan: vi.fn(async () => ({ id: 'plan1', status: 'preview' })),
    executeCrm: vi.fn(async () => ({
      plan: { id: 'plan1', status: 'complete' },
    })),
  };
  return { w, backend };
}
describe('Pomade API keys and tools', () => {
  it('generates private credentials, keeps only hashes in server config, and revokes a key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pomade-api-'));
    try {
      await writeFile(join(root, '.env.local'), 'EXISTING_KEY=keep-this\n');
      const created = await manageApiKey(
        ['create', 'Local test', '--scopes', 'read,run'],
        root,
      );
      if (!('clientEnv' in created))
        throw new Error('Key creation did not return credentials.');
      const privateEnv = parseEnv(await readFile(created.clientEnv!, 'utf8'));
      const serverText = await readFile(join(root, '.env.local'), 'utf8');
      expect(serverText).toContain('EXISTING_KEY=keep-this');
      expect(serverText).not.toContain(privateEnv.POMADE_API_KEY);
      expect((await stat(created.clientEnv!)).mode & 0o777).toBe(0o600);
      const authenticated = await authenticatePomadeApi(
        request(privateEnv.POMADE_API_KEY),
        parseEnv(serverText).POMADE_API_KEYS,
      );
      expect(authenticated.scopes).toEqual(['read', 'run']);
      expect(await readFile(created.mcpConfig!, 'utf8')).not.toContain(
        privateEnv.POMADE_API_KEY,
      );
      await manageApiKey(['create', 'Second'], root);
      await manageApiKey(['revoke', created.id!], root);
      await expect(
        authenticatePomadeApi(
          request(privateEnv.POMADE_API_KEY),
          parseEnv(await readFile(join(root, '.env.local'), 'utf8'))
            .POMADE_API_KEYS,
        ),
      ).rejects.toMatchObject({ status: 401 });
      const before = await readFile(join(root, '.env.local'), 'utf8');
      await expect(
        manageApiKey(['create', 'invalid\nname'], root),
      ).rejects.toThrow('key name');
      expect(await readFile(join(root, '.env.local'), 'utf8')).toBe(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('rejects missing/wrong keys, malformed config and remote origins', async () => {
    expect(await authenticatePomadeApi(request(), config)).toMatchObject({
      id: 'key1',
    });
    for (const credential of ['', 'pomade_' + 'y'.repeat(55)])
      await expect(
        authenticatePomadeApi(request(credential), config),
      ).rejects.toMatchObject({ status: 401 });
    await expect(
      authenticatePomadeApi(request(), 'not-json'),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      authenticatePomadeApi(request(token, 'https://public.example'), config),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      authenticatePomadeApi(
        request(token, undefined, { Origin: 'https://evil.example' }),
        config,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('hides ungranted tools and enforces scopes even on a direct call', async () => {
    const reader = { ...key, scopes: ['read'] as PomadeApiKey['scopes'] };
    const { backend } = fixture();
    expect(apiCatalog(reader).tools.map((t) => t.name)).toEqual([
      'list_tables',
      'get_table',
      'search_rows',
      'list_runs',
    ]);
    expect(JSON.stringify(apiCatalog(key))).not.toContain(key.sha256);
    for (const name of ['run_recipe', 'read_crm', 'execute_crm_sync'])
      await expect(
        callPomadeTool(name, {}, reader, backend),
      ).rejects.toMatchObject({ status: 403 });
    expect(backend.executeCrm).not.toHaveBeenCalled();
    expect(backend.runRecipe).not.toHaveBeenCalled();
    await expect(
      callPomadeTool('constructor', {}, key, backend),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('paginates stored rows and filters headcount without treating blanks as zero', async () => {
    const { backend } = fixture();
    expect(
      await callPomadeTool(
        'get_table',
        { tableId: 'accounts', limit: 1 },
        key,
        backend,
      ),
    ).toMatchObject({ totalRows: 3, nextOffset: 1, rows: [{ id: 'a' }] });
    expect(
      await callPomadeTool(
        'search_rows',
        {
          tableId: 'accounts',
          filters: [
            {
              columnId: 'headcount',
              operator: 'less_than_or_equal',
              value: '50',
            },
          ],
        },
        key,
        backend,
      ),
    ).toMatchObject({
      source: 'saved_table',
      totalRows: 1,
      rows: [{ id: 'b' }],
    });
    expect(
      await callPomadeTool(
        'search_rows',
        { tableId: 'accounts', query: 'HEALTH' },
        key,
        backend,
      ),
    ).toMatchObject({ totalRows: 1, rows: [{ id: 'a' }] });
    await expect(
      callPomadeTool(
        'search_rows',
        {
          tableId: 'accounts',
          filters: [{ columnId: 'missing', operator: 'equals', value: 'x' }],
        },
        key,
        backend,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      callPomadeTool('get_table', { tableId: 'missing' }, key, backend),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('executes only explicit existing rows/recipes from the saved table with external calls off by default', async () => {
    const { backend, w } = fixture();
    await callPomadeTool(
      'run_recipe',
      { tableId: w.id, rowIds: ['a'], columnIds: ['summary'] },
      key,
      backend,
    );
    expect(backend.runRecipe).toHaveBeenCalledWith(
      w,
      ['a'],
      ['summary'],
      false,
    );
    for (const extra of [
      { rowIds: [] },
      { rowIds: ['a', 'a'] },
      { rowIds: ['missing'] },
      { columnIds: ['company'] },
      { workspace: { rows: [] } },
    ]) {
      await expect(
        callPomadeTool(
          'run_recipe',
          { tableId: w.id, rowIds: ['a'], columnIds: ['summary'], ...extra },
          key,
          backend,
        ),
      ).rejects.toThrow();
    }
    expect(backend.runRecipe).toHaveBeenCalledTimes(1);
  });
  it('uses saved CRM mappings, rejects mismatched objects and requires write confirmation', async () => {
    const { backend, w } = fixture();
    await callPomadeTool(
      'preview_crm_sync',
      { tableId: w.id, rowIds: ['a'], mappingId: 'hubspot' },
      key,
      backend,
    );
    expect(backend.previewCrm).toHaveBeenCalledWith(
      w.id,
      ['a'],
      w.crmMappings![0].config,
    );
    await expect(
      callPomadeTool(
        'read_crm',
        { provider: 'hubspot', objectType: 'lead' },
        key,
        backend,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      callPomadeTool('execute_crm_sync', { planId: 'plan1' }, key, backend),
    ).rejects.toMatchObject({ status: 400 });
    expect(backend.executeCrm).not.toHaveBeenCalled();
    await callPomadeTool(
      'execute_crm_sync',
      { planId: 'plan1', confirmWrite: true },
      key,
      backend,
    );
    expect(backend.executeCrm).toHaveBeenCalledWith('plan1');
  });
  it('connects an official MCP client, discovers tools, and calls the authenticated API', async () => {
    const { backend } = fixture();
    const fetchImpl = vi.fn<typeof fetch>(async (url, options) => {
      const req = new Request(url, options);
      try {
        const authenticated = await authenticatePomadeApi(req, config);
        const name = new URL(req.url).pathname.split('/')[3];
        return Response.json(
          name
            ? await callPomadeTool(
                name,
                await req.json(),
                authenticated,
                backend,
              )
            : apiCatalog(authenticated),
        );
      } catch (error) {
        return apiErrorResponse(error);
      }
    });
    const server = await createPomadeMcp({ key: token, fetchImpl });
    const client = new Client({ name: 'pomade-test', version: '1' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect((await client.listTools()).tools).toHaveLength(9);
      const result = await client.callTool({
        name: 'search_rows',
        arguments: { tableId: 'accounts', query: 'Solera' },
      });
      expect(result.structuredContent).toMatchObject({ rows: [{ id: 'c' }] });
      const bad = await client.callTool({
        name: 'get_table',
        arguments: { tableId: 'missing' },
      });
      expect(bad.isError).toBe(true);
      expect(
        fetchImpl.mock.calls.every(
          ([, options]) => options?.redirect === 'error',
        ),
      ).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it('does not send a Pomade credential to a nonlocal URL', () => {
    for (const url of [
      'https://external.example',
      'http://127.0.0.1@evil.example',
      'http://localhost/api?token=x',
    ])
      expect(() => pomadeApiClient({ key: token, url })).toThrow(
        'local Pomade origin',
      );
  });
});
