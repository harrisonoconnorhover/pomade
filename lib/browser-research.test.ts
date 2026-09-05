import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import {
  createBrowserSession,
  validatePublicUrl,
  evidenceFromBrowser,
} from '../scripts/research-browser.mjs';
import {
  codexArguments,
  createCodexServer,
} from '../scripts/codex-research.mjs';
import { researchConfiguration } from './research-provider';
import { CodexWebResearchClient } from './codex-client';
import { applyWebResearchResult } from './web-research';
import { createTable } from './workbook';

const source = {
  url: 'https://example.com/security',
  title: 'Security',
  status: 'read',
  visitedAt: '2026-09-05T23:00:00.000Z',
  text: 'Our independent auditor completed the SOC 2 Type II examination.',
  links: [],
  truncated: false,
};
const quote = 'completed the SOC 2 Type II examination.';
describe('local browser research', () => {
  it('rejects private URLs and DNS destinations before a public browser request', async () => {
    const dns = vi
      .fn()
      .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    expect(await validatePublicUrl('https://example.com/about#top', dns)).toBe(
      'https://example.com/about',
    );
    for (const url of [
      'file:///etc/passwd',
      'http://localhost/',
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://router.local/',
      'https://user:password@example.com/',
      'https://example.com:8798/',
    ])
      await expect(validatePublicUrl(url, dns)).rejects.toThrow(
        'public website',
      );
    for (const [address, family] of [
      ['127.0.0.1', 4],
      ['10.0.0.1', 4],
      ['169.254.169.254', 4],
      ['::1', 6],
      ['::ffff:127.0.0.1', 6],
      ['fd00::1', 6],
    ])
      await expect(
        validatePublicUrl(
          'https://example.com/',
          vi.fn().mockResolvedValue([{ address, family }]),
        ),
      ).rejects.toThrow('private-network');
  });
  it('accepts only quotations present on successfully visited final URLs', () => {
    const result = evidenceFromBrowser(
      {
        citations: [
          { url: source.url, quote },
          { url: 'https://unvisited.example.com', quote },
          {
            url: source.url,
            quote:
              'We have another unrelated certification that the website never mentioned.',
          },
        ],
      },
      [source],
    );
    expect(result.citations).toEqual([
      {
        url: source.url,
        title: source.title,
        excerpt: quote,
        visitedAt: source.visitedAt,
      },
    ]);
    expect(JSON.stringify(result.browserVisits)).not.toContain(source.text);
    expect(
      evidenceFromBrowser({ citations: [{ url: source.url, quote }] }, [
        { ...source, status: 'blocked' },
      ]).citations,
    ).toEqual([]);
  });
  it('renders client-side text, follows a link, prevents POSTs, and enforces its page budget in real Chromium', async () => {
    let mutations = 0;
    const fixture = createServer((req, res) => {
      if (req.method === 'POST') mutations++;
      res.setHeader('Content-Type', 'text/html');
      if (req.url === '/pricing')
        res.end(
          '<h1>Pricing</h1><p>Our team plan starts at 49 dollars per month. Enterprise plans are available by contacting sales for a quote.</p>',
        );
      else
        res.end(
          '<h1>Example Company</h1><main id="content"></main><a href="/pricing">Pricing and enterprise plans</a><script>setTimeout(()=>{document.getElementById("content").innerText="We provide business software to revenue operations teams. This content is rendered by JavaScript after the page loads."},50);fetch("/mutate",{method:"POST"}).catch(()=>{});</script>',
        );
    });
    await new Promise<void>((resolve) =>
      fixture.listen(0, '127.0.0.1', resolve),
    );
    const base = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`;
    const session = await createBrowserSession({
      maxPages: 2,
      urlPolicy: async (value) => {
        if (new URL(value).origin !== base) throw new Error('Fixture only');
        return value;
      },
    });
    try {
      const home = await session.openPage(base);
      expect(home.status).toBe('read');
      expect(home.text).toContain('rendered by JavaScript');
      const pricing = await session.openPage(
        home.links.find((l: { text: string }) => l.text.includes('Pricing'))!
          .url,
      );
      expect(pricing.text).toContain('49 dollars');
      expect(mutations).toBe(0);
      await expect(session.openPage(base)).rejects.toThrow('page budget');
    } finally {
      await session.close();
      fixture.closeAllConnections();
      await new Promise<void>((resolve) => fixture.close(() => resolve()));
    }
  }, 20_000);
  it('keeps blocked pages as failed observations rather than supporting evidence', async () => {
    const fixture = createServer((_req, res) => {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end(
        '<title>Access denied</title><p>Checking your browser. Verify you are human to read the full security report and supporting compliance information on this page.</p>',
      );
    });
    await new Promise<void>((resolve) =>
      fixture.listen(0, '127.0.0.1', resolve),
    );
    const base = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`;
    const session = await createBrowserSession({
      urlPolicy: async (url) => {
        if (new URL(url).origin !== base) throw new Error('Fixture only');
        return url;
      },
    });
    try {
      expect(await session.openPage(base)).toMatchObject({
        status: 'blocked',
        httpStatus: 403,
      });
    } finally {
      await session.close();
      fixture.closeAllConnections();
      await new Promise<void>((resolve) => fixture.close(() => resolve()));
    }
  }, 20_000);
  it('separates browser cache identity, enables only the browser MCP, and preserves evidence in rows and receipts', async () => {
    const plain = researchConfiguration({ POMADE_RESEARCH_PROVIDER: 'codex' });
    const browser = researchConfiguration({
      POMADE_RESEARCH_PROVIDER: 'codex',
      POMADE_CODEX_BROWSER: 'true',
    });
    expect(browser.model).not.toBe(plain.model);
    expect(browser.label).toBe('Codex + local browser');
    const args = codexArguments(
      '/tmp/schema',
      '/tmp/answer',
      undefined,
      '/tmp/visits',
    );
    expect(args).toContain('--ignore-user-config');
    expect(args).toContain('features.shell_tool=false');
    expect(
      args.some(
        (a) =>
          a.includes('mcp_servers.pomade_browser.args=') &&
          a.includes('/tmp/visits'),
      ),
    ).toBe(true);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        answer: '{"summary":"Example"}',
        citations: [{ url: source.url, title: source.title, excerpt: quote }],
        queries: [],
        browserVisits: [{ ...source, text: undefined, links: undefined }],
      }),
    );
    const result = await new CodexWebResearchClient({
      token: 'test',
      browser: true,
      fetchImpl,
    }).research('Visit example.com');
    const requestBody = fetchImpl.mock.calls[0][1]?.body;
    if (typeof requestBody !== 'string')
      throw new Error('Expected JSON request body.');
    expect(JSON.parse(requestBody).browser).toBe(true);
    const w = createTable({
      id: 'browser-test',
      name: 'Browser test',
      mode: 'empty',
    });
    w.rows = [{ id: 'row', values: { company: 'Example' } }];
    const applied = applyWebResearchResult(
      w,
      'row',
      {
        id: 'summary',
        title: 'Summary',
        kind: 'enrichment',
        recipe: 'web-research',
        width: 100,
        outputFields: [{ id: 'summary', title: 'Summary', valueType: 'text' }],
      },
      result,
      Date.now(),
      'codex',
    );
    expect(applied.receipt.browserVisits).toHaveLength(1);
    expect(applied.receipt.references?.[0].excerpt).toBe(quote);
    expect(
      JSON.parse(applied.workspace.rows[0].values.__research_summary_browser),
    ).toHaveLength(1);
  });
  it('requires a recorded browser visit even when the agent uses web search and validates returned quotes', async () => {
    let recordVisit = true;
    const run = vi
      .fn()
      .mockImplementation((_binary: string, args: string[]) => {
        if (args.includes('status'))
          return Promise.resolve({
            stdout: 'Logged in using ChatGPT',
            stderr: '',
          });
        const traceConfig = args.find((a) =>
          a.startsWith('mcp_servers.pomade_browser.args='),
        )!;
        const trace = JSON.parse(
          traceConfig.slice(traceConfig.indexOf('=') + 1),
        )[1];
        const answerPath = args[args.indexOf('--output-last-message') + 1];
        const work = Promise.all([
          writeFile(trace, JSON.stringify(recordVisit ? [source] : [])),
          writeFile(
            answerPath,
            JSON.stringify({
              answer: '{"summary":"Example"}',
              citations: [{ url: source.url, title: 'Made-up title', quote }],
            }),
          ),
        ]).then(() => ({
          stdout: JSON.stringify({
            type: 'item.completed',
            item: { type: 'web_search', query: 'example' },
          }),
          stderr: '',
        }));
        return Object.assign(work, { child: { stdin: { end: vi.fn() } } });
      });
    const server = createCodexServer({ token: 'z'.repeat(32), run });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = () =>
      fetch(base + '/research', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + 'z'.repeat(32),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: 'Read the company site',
          browser: true,
        }),
      });
    try {
      const response = await request();
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        citations: { title: string; excerpt: string }[];
      };
      expect(body.citations[0]).toMatchObject({
        title: source.title,
        excerpt: quote,
      });
      recordVisit = false;
      expect((await request()).status).toBe(502);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
