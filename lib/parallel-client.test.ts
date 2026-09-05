import { describe, expect, it, vi } from 'vitest';

import { ParallelWebResearchClient } from './parallel-client';

function clientFor(response: Response) {
  const fetchImpl = vi.fn().mockResolvedValue(response);
  return {
    client: new ParallelWebResearchClient({
      apiKey: 'test-parallel-key',
      model: 'speed',
      fetchImpl: fetchImpl as typeof fetch,
    }),
    fetchImpl,
  };
}

describe('Parallel web research client', () => {
  it('uses Parallel Chat and keeps basis and inline citations', async () => {
    const { client, fetchImpl } = clientFor(
      Response.json({
        model: 'speed',
        choices: [
          {
            message: {
              content:
                'Example launched a product. See [Example newsroom](https://example.com/news).',
            },
          },
        ],
        basis: [
          {
            citations: [
              { url: 'https://example.com/news', excerpts: ['Launch details'] },
              { url: 'https://example.org/context' },
            ],
          },
        ],
      }),
    );

    const result = await client.research('Research Example.');
    const [url, request] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(request.body)) as {
      model: string;
      messages: Array<{ role: string }>;
      stream: boolean;
    };

    expect(url).toBe('https://api.parallel.ai/chat/completions');
    expect(request.headers).toMatchObject({
      authorization: 'Bearer test-parallel-key',
    });
    expect(body).toMatchObject({ model: 'speed', stream: false });
    expect(body.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
    ]);
    expect(result).toMatchObject({
      model: 'speed',
      citations: [
        { title: 'example.com', url: 'https://example.com/news' },
        { title: 'example.org', url: 'https://example.org/context' },
      ],
      cached: false,
    });
  });

  it('returns an actionable insufficient-credit error', async () => {
    const { client } = clientFor(
      Response.json(
        { error: { message: 'Insufficient account balance' } },
        { status: 402 },
      ),
    );

    await expect(client.research('Research Example.')).rejects.toThrow(
      'Parallel account needs more credits',
    );
  });

  it('rejects an empty local key before making a request', async () => {
    const fetchImpl = vi.fn();
    const client = new ParallelWebResearchClient({
      apiKey: '',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.research('Research Example.')).rejects.toThrow(
      'PARALLEL_API_KEY',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
