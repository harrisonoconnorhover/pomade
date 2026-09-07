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

it('requests native structured output, retains complete JSON and extracts its source citations', async () => {
  const payload = {
    summary: 'x'.repeat(4500),
    _pomade_citations: [
      { url: 'https://example.com/news', title: 'Company news' },
    ],
  };
  const { client, fetchImpl } = clientFor(
    Response.json({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
  );
  const result = await client.research('Summarize the company.', [
    { id: 'summary', title: 'Summary', valueType: 'text' },
  ]);
  const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
  expect(body.response_format).toMatchObject({
    type: 'json_schema',
    json_schema: {
      schema: {
        required: ['summary', '_pomade_citations'],
        additionalProperties: false,
      },
    },
  });
  expect(JSON.parse(result.answer)).toEqual(payload);
  expect(result.citations).toContainEqual({
    url: 'https://example.com/news',
    title: 'Company news',
  });
});

it('uses an object-root schema for list research and unwraps cited rows', async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                results: [
                  {
                    company: 'Example',
                    _pomade_citations: [
                      { url: 'https://example.com', title: 'Company' },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
    );
  const client = new ParallelWebResearchClient({ apiKey: 'test', fetchImpl });
  const result = await client.research(
    'Find Example',
    [{ id: 'company', title: 'Company', valueType: 'text' }],
    'list',
    3,
  );
  const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
  expect(body.response_format.json_schema.schema.type).toBe('object');
  expect(body.response_format.json_schema.schema.properties.results.type).toBe(
    'array',
  );
  expect(JSON.stringify(body.response_format.json_schema.schema)).not.toContain(
    'maxItems',
  );
  expect(JSON.parse(result.answer)).toMatchObject([{ company: 'Example' }]);
  expect(result.citations).toHaveLength(1);
});
