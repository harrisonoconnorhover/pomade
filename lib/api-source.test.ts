import { describe, it, expect, vi } from 'vitest';
import {
  fetchApiSource,
  importApiSource,
  validateApiSource,
  type ApiSourceConfig,
} from './api-source';
import { createTable } from './workbook';
const connection = {
  id: 'fixture',
  label: 'Fixture',
  origin: 'https://api.example.com',
  methods: ['GET', 'POST'] as ('GET' | 'POST')[],
  headers: { Authorization: 'Bearer secret' },
};
const config: ApiSourceConfig = {
  connectionId: 'fixture',
  method: 'GET',
  path: '/companies',
  recordsPath: 'data',
  identityPath: 'id',
  pagination: 'page',
  parameter: 'page',
  start: 1,
  pageSize: 2,
  sizeParameter: 'limit',
  cursorPath: 'next',
  maxPages: 4,
  maxRows: 10,
};
const row = (id: number) => ({
  id,
  company: `Company ${id}`,
  domain: `company${id}.test`,
});
describe('API list source', () => {
  it('paginates page numbers, maps and deduplicates stable IDs across imports', async () => {
    const urls: string[] = [];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        urls.push(url.toString());
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer secret',
        );
        const page = Number(url.searchParams.get('page'));
        return Response.json({
          data:
            page === 1 ? [row(1), row(2)] : page === 2 ? [row(2), row(3)] : [],
        });
      });
    const batch = await fetchApiSource('t', config, connection, fetcher);
    expect(batch.status).toBe('complete');
    expect(batch.records).toHaveLength(3);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain('limit=2');
    expect(JSON.stringify(batch)).not.toContain('Bearer secret');
    const w = createTable({ id: 't', name: 'Test', mode: 'empty' });
    const imported = importApiSource(w, batch, {
      company: 'company',
      domain: 'domain',
    });
    expect(imported.added).toBe(3);
    const repeated = await fetchApiSource('t', config, connection, fetcher);
    expect(
      importApiSource(imported.workspace, repeated, { company: 'company' })
        .skipped,
    ).toBe(3);
  });
  it('advances offsets by actual record count and encodes cursors', async () => {
    const offsets: string[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const u = new URL(input instanceof Request ? input.url : input);
      offsets.push(u.searchParams.get('offset')!);
      return Response.json({ data: offsets.length === 1 ? [row(1)] : [] });
    });
    await fetchApiSource(
      't',
      { ...config, pagination: 'offset', parameter: 'offset', start: 0 },
      connection,
      fetcher,
    );
    expect(offsets).toEqual(['0', '1']);
    const cursors: string[] = [];
    const cursorFetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const u = new URL(input instanceof Request ? input.url : input);
        cursors.push(u.searchParams.get('cursor') ?? '');
        return Response.json({
          data: [row(cursors.length)],
          next: cursors.length === 1 ? 'a&b /?' : null,
        });
      });
    const result = await fetchApiSource(
      't',
      { ...config, pagination: 'cursor', parameter: 'cursor' },
      connection,
      cursorFetcher,
    );
    expect(cursors).toEqual(['', 'a&b /?']);
    expect(result.status).toBe('complete');
  });
  it('retains earlier rows on HTTP failure and refuses repeated cursors without retries', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [row(1)] }))
      .mockResolvedValueOnce(new Response('secret error', { status: 429 }));
    const batch = await fetchApiSource('t', config, connection, fetcher);
    expect(batch.status).toBe('partial');
    expect(batch.records).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(batch.reason).not.toContain('secret');
    const repeat = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ data: [row(1)], next: 'same' }),
      );
    const result = await fetchApiSource(
      't',
      { ...config, pagination: 'cursor' },
      connection,
      repeat,
    );
    expect(repeat).toHaveBeenCalledTimes(2);
    expect(result.reason).toContain('Repeated');
  });
  it('bounds requests, records, stored data and malformed payloads', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ data: [row(1), row(2), row(3)] }),
      );
    const result = await fetchApiSource(
      't',
      { ...config, maxRows: 2 },
      connection,
      f,
    );
    expect(result.status).toBe('limited');
    expect(result.records).toHaveLength(2);
    expect(f).toHaveBeenCalledTimes(1);
    const big = await fetchApiSource('t', config, connection, async () =>
      Response.json({ data: [{ ...row(1), blob: 'x'.repeat(760000) }] }),
    );
    expect(big.status).toBe('limited');
    expect(big.records).toHaveLength(0);
    const malformed = await fetchApiSource('t', config, connection, async () =>
      Response.json({ data: [1] }),
    );
    expect(malformed.status).toBe('failed');
    expect(() => validateApiSource({ ...config, maxPages: 11 })).toThrow();
    expect(() =>
      validateApiSource({ ...config, path: '//other.test' }),
    ).toThrow();
  });
  it('sends static JSON POST bodies and does not follow redirects', async () => {
    const body = JSON.stringify({ filter: 'a "quote"' });
    const f = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      expect(init?.body).toBe(body);
      expect(init?.redirect).toBe('manual');
      return new Response(null, { status: 302 });
    });
    const result = await fetchApiSource(
      't',
      { ...config, method: 'POST', body },
      connection,
      f,
    );
    expect(result.reason).toContain('302');
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('preserves existing rows, validates destination mapping and table scope', async () => {
    const b = await fetchApiSource(
      't',
      { ...config, pagination: 'none' },
      connection,
      async () => Response.json({ data: [row(1)] }),
    );
    const w = createTable({ id: 't', name: 'Test', mode: 'empty' });
    w.rows = [{ id: 'original', values: { company: 'Keep' } }];
    const result = importApiSource(w, b, { company: 'company' });
    expect(result.workspace.rows[0]).toEqual(w.rows[0]);
    expect(result.workspace.rows[1].apiSource?.batchId).toBe(b.id);
    expect(() => importApiSource(w, b, { status: 'company' })).toThrow();
    expect(() =>
      importApiSource({ ...w, id: 'other' }, b, { company: 'company' }),
    ).toThrow();
  });
});
