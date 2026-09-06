import { describe, it, expect, vi } from 'vitest';
import { CodexWebResearchClient } from './codex-client';
import {
  researchConfiguration,
  createResearchClient,
} from './research-provider';
import {
  codexArguments,
  codexEnvironment,
  createCodexServer,
} from '../scripts/codex-research.mjs';
import { writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';

describe('local ChatGPT research', () => {
  it('keeps explicit Codex selection even when Parallel has a key', async () => {
    const env = {
      POMADE_RESEARCH_PROVIDER: 'codex',
      PARALLEL_API_KEY: 'parallel-secret',
    };
    expect(researchConfiguration(env)).toMatchObject({
      provider: 'codex',
      configured: false,
    });
    expect(createResearchClient(env)).toBeInstanceOf(CodexWebResearchClient);
    const f = vi.fn<typeof fetch>();
    await expect(
      new CodexWebResearchClient({ fetchImpl: f }).research('Research'),
    ).rejects.toThrow('POMADE_CODEX_TOKEN');
    expect(f).not.toHaveBeenCalled();
    expect(researchConfiguration({ PARALLEL_API_KEY: 'key' }).provider).toBe(
      'parallel',
    );
  });
  it('uses the private loopback helper and keeps subscription errors out of API fallbacks', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          answer: '{"fit":true}',
          citations: [
            { url: 'https://example.com', title: 'Evidence' },
            { url: 'javascript:alert(1)', title: 'Bad' },
          ],
          queries: ['company'],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    const c = new CodexWebResearchClient({
      token: 'local-secret',
      fetchImpl: f,
    });
    const r = await c.research('Research this company');
    expect(r.answer).toBe('{"fit":true}');
    expect(r.citations).toHaveLength(1);
    expect(f.mock.calls[0][0]).toBe('http://127.0.0.1:9876/research');
    expect(f.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer local-secret' },
      redirect: 'manual',
    });
    await expect(c.research('Again')).rejects.toThrow('already running');
    expect(
      () => new CodexWebResearchClient({ url: 'https://external.example' }),
    ).toThrow('local helper');
  });
  it('removes provider secrets and restricts research to official ChatGPT login plus live search', () => {
    expect(
      codexEnvironment({
        HOME: '/home/test',
        PATH: '/bin',
        OPENAI_API_KEY: 'secret',
        HUBSPOT_ACCESS_TOKEN: 'secret',
        PARALLEL_API_KEY: 'secret',
      }),
    ).toEqual({ HOME: '/home/test', PATH: '/bin' });
    const args = codexArguments('/tmp/schema', '/tmp/answer', undefined);
    expect(args).toContain('forced_login_method="chatgpt"');
    expect(args).toContain('web_search="live"');
    expect(args).toContain('features.shell_tool=false');
    expect(args).toContain('features.apps=false');
    expect(args).toContain('agents.enabled=false');
  });
  it('distinguishes missing browser, missing login and unavailable Codex instead of treating every 503 as a login problem', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ code: 'browser_unavailable' }, { status: 503 }),
      )
      .mockResolvedValueOnce(
        Response.json({ code: 'chatgpt_login_required' }, { status: 503 }),
      )
      .mockResolvedValueOnce(
        Response.json({ code: 'codex_unavailable' }, { status: 503 }),
      )
      .mockResolvedValueOnce(
        Response.json({ error: 'private diagnostic content' }, { status: 503 }),
      );
    const client = new CodexWebResearchClient({
      token: 'fixture',
      browser: true,
      fetchImpl: fetcher,
    });
    await expect(client.research('Research')).rejects.toThrow(
      'Install local Chromium',
    );
    await expect(client.status()).rejects.toThrow('Sign in to Codex');
    await expect(client.status()).rejects.toThrow('POMADE_CODEX_BIN');
    await expect(client.status()).rejects.toThrow(
      'The local research helper is not ready.',
    );
  });
  it('rechecks readiness after setup is repaired and identifies an absent browser independently', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ configured: false }))
      .mockResolvedValueOnce(
        Response.json({ configured: true, browserAvailable: false }),
      )
      .mockResolvedValueOnce(
        Response.json({ configured: true, browserAvailable: true }),
      );
    const client = new CodexWebResearchClient({
      token: 'fixture',
      browser: true,
      fetchImpl: fetcher,
    });
    await expect(client.status()).rejects.toThrow('Sign in to Codex');
    await expect(client.status()).rejects.toThrow('Install local Chromium');
    await expect(client.status()).resolves.toEqual({ configured: true });
  });
  it('authenticates helper requests, requires search evidence, and returns structured answers', async () => {
    let searched = true;
    let signedIn = true;
    const run = vi
      .fn()
      .mockImplementation((_binary: string, args: string[]) => {
        if (args.includes('status'))
          return Promise.resolve({
            stdout: '',
            stderr: signedIn ? 'Logged in using ChatGPT' : 'Not logged in',
          });
        const answer = args[args.indexOf('--output-last-message') + 1];
        const result = writeFile(
          answer,
          JSON.stringify({
            answer: '{"fit":true}',
            citations: [{ url: 'https://example.com', title: 'Source' }],
          }),
        ).then(() => ({
          stdout: searched
            ? JSON.stringify({
                type: 'item.completed',
                item: { type: 'web_search', query: 'example company' },
              })
            : '',
          stderr: '',
        }));
        return Object.assign(result, { child: { stdin: { end: vi.fn() } } });
      });
    const token = 'a'.repeat(32);
    const server = createCodexServer({ token, run });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    try {
      expect((await fetch(base + '/status')).status).toBe(401);
      expect(run).not.toHaveBeenCalled();
      expect(
        (
          await fetch(base + '/status', {
            headers: { ...headers, Origin: 'https://unrelated.example' },
          })
        ).status,
      ).toBe(401);
      expect((await fetch(base + '/status', { headers })).status).toBe(200);
      signedIn = false;
      const notReady = await fetch(base + '/status', { headers });
      expect(notReady.status).toBe(503);
      expect(await notReady.json()).toMatchObject({
        configured: false,
        code: 'chatgpt_login_required',
      });
      signedIn = true;
      const result = await fetch(base + '/research', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: 'Research' }),
      });
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({
        answer: '{"fit":true}',
        queries: ['example company'],
      });
      searched = false;
      expect(
        (
          await fetch(base + '/research', {
            method: 'POST',
            headers,
            body: JSON.stringify({ prompt: 'Research again' }),
          })
        ).status,
      ).toBe(502);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
