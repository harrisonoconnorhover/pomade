import { describe, expect, it, vi } from 'vitest';

import {
  ApolloClient,
  apolloCacheKey,
  normalizeCompanyDomain,
} from './apollo-client';

const INPUT = {
  fullName: 'Ada Lovelace',
  companyDomain: 'https://www.example.com/about',
  organizationName: 'Example',
};

function clientFor(response: Response) {
  const fetchImpl = vi.fn().mockResolvedValue(response);
  return {
    client: new ApolloClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    }),
    fetchImpl,
  };
}

describe('Apollo client', () => {
  it('requests only synchronous business-profile enrichment', async () => {
    const { client, fetchImpl } = clientFor(
      Response.json({
        person: {
          id: 'person-1',
          name: 'Ada Lovelace',
          title: 'Founder',
          email: 'ada@example.com',
          email_status: 'verified',
          linkedin_url: 'https://linkedin.com/in/ada',
          city: 'London',
          country: 'United Kingdom',
          organization: { primary_domain: 'example.com' },
        },
        credits_consumed: '1',
      }),
    );

    const result = await client.enrichPerson(INPUT);
    const [requestUrl, request] = fetchImpl.mock.calls[0]!;
    const url = new URL(String(requestUrl));

    expect(url.searchParams.get('name')).toBe('Ada Lovelace');
    expect(url.searchParams.get('domain')).toBe('example.com');
    expect(url.searchParams.get('reveal_personal_emails')).toBe('false');
    expect(url.searchParams.get('reveal_phone_number')).toBe('false');
    expect(url.searchParams.has('webhook_url')).toBe(false);
    expect(request).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
    });
    expect(result).toMatchObject({
      personId: 'person-1',
      workEmail: 'ada@example.com',
      status: 'found',
      location: 'London, United Kingdom',
      creditsConsumed: 1,
      cached: false,
    });
  });

  it('holds a mismatched identity for review without exposing its fields', async () => {
    const { client } = clientFor(
      Response.json({
        person: {
          id: 'wrong-person',
          name: 'Grace Hopper',
          email: 'grace@example.com',
          email_status: 'verified',
          organization: { primary_domain: 'example.com' },
        },
      }),
    );

    await expect(client.enrichPerson(INPUT)).resolves.toMatchObject({
      personId: null,
      workEmail: null,
      candidateEmail: null,
      status: 'needs_review',
    });
  });

  it('holds an unverified same-person email as a review candidate', async () => {
    const { client } = clientFor(
      Response.json({
        person: {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          email_status: 'guessed',
          organization: { primary_domain: 'example.com' },
        },
      }),
    );

    await expect(client.enrichPerson(INPUT)).resolves.toMatchObject({
      workEmail: null,
      candidateEmail: 'ada@example.com',
      status: 'needs_review',
    });
  });

  it('maps rate-limit responses into an actionable retry message', async () => {
    const { client } = clientFor(
      new Response('Too many requests', {
        status: 429,
        headers: { 'retry-after': '45' },
      }),
    );

    await expect(client.enrichPerson(INPUT)).rejects.toThrow(
      'Try again in 45 seconds',
    );
  });

  it('keeps Apollo permission details when a 403 is returned', async () => {
    const { client } = clientFor(
      Response.json(
        { message: 'API access is not enabled for this account' },
        { status: 403 },
      ),
    );

    await expect(client.enrichPerson(INPUT)).rejects.toThrow(
      'Apollo said: API access is not enabled for this account',
    );
  });

  it('normalizes domains and produces stable privacy-safe cache keys', async () => {
    expect(normalizeCompanyDomain(INPUT.companyDomain)).toBe('example.com');
    await expect(apolloCacheKey(INPUT)).resolves.toMatch(/^[a-f0-9]{64}$/);
    await expect(
      apolloCacheKey({ ...INPUT, companyDomain: 'EXAMPLE.COM' }),
    ).resolves.toBe(await apolloCacheKey(INPUT));
  });
});
