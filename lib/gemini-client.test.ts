import { describe, expect, it, vi } from 'vitest';

import { GeminiWebResearchClient } from './gemini-client';

function clientFor(response: Response) {
  const fetchImpl = vi.fn().mockResolvedValue(response);
  return {
    client: new GeminiWebResearchClient({
      apiKey: 'test-google-key',
      model: 'gemini-3.8-flash',
      fetchImpl: fetchImpl as typeof fetch,
    }),
    fetchImpl,
  };
}

describe('Gemini grounded web research client', () => {
  it('uses the Interactions API with Google Search and returns citations', async () => {
    const { client, fetchImpl } = clientFor(
      Response.json({
        status: 'completed',
        model: 'gemini-3.8-flash',
        steps: [
          {
            type: 'google_search_call',
            arguments: { queries: ['Example company latest news'] },
          },
          {
            type: 'model_output',
            content: [
              {
                type: 'text',
                text: 'Example launched a new product this week.',
                annotations: [
                  {
                    type: 'url_citation',
                    title: 'Example newsroom',
                    url: 'https://example.com/news',
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const result = await client.research('Research Example.');
    const [url, request] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(request.body)) as {
      store: boolean;
      tools: Array<{ type: string }>;
    };

    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    );
    expect(request.headers).toMatchObject({
      'x-goog-api-key': 'test-google-key',
    });
    expect(body.store).toBe(false);
    expect(body.tools).toEqual([{ type: 'google_search' }]);
    expect(result).toMatchObject({
      answer: 'Example launched a new product this week.',
      queries: ['Example company latest news'],
      citations: [
        {
          title: 'Example newsroom',
          url: 'https://example.com/news',
        },
      ],
      cached: false,
    });
  });

  it('returns an actionable invalid-key error', async () => {
    const { client } = clientFor(
      Response.json(
        { error: { message: 'API key not valid' } },
        { status: 401 },
      ),
    );

    await expect(client.research('Research Example.')).rejects.toThrow(
      'Google AI Studio API key is invalid',
    );
  });

  it('rejects an empty local key before making a request', async () => {
    const fetchImpl = vi.fn();
    const client = new GeminiWebResearchClient({
      apiKey: '',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.research('Research Example.')).rejects.toThrow(
      'GEMINI_API_KEY',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
