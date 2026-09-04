import { describe, expect, it, vi } from 'vitest';

import { readCrmSource } from './crm-sources';

describe('CRM source readers', () => {
  it('reads and shapes a bounded HubSpot contacts preview', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        results: [
          {
            id: '101',
            properties: {
              firstname: 'Ada',
              lastname: 'Lovelace',
              email: 'ada@example.com',
              company: 'Example',
              phone: '+1 555 0101',
              jobtitle: 'Founder',
              website: 'https://example.com',
            },
          },
        ],
      }),
    );

    const preview = await readCrmSource('hubspot', 25, {
      hubSpotAccessToken: 'hubspot-test',
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date('2026-09-04T12:00:00Z'),
    });

    const [url, request] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain('/crm/objects/2026-03/contacts');
    expect(new URL(String(url)).searchParams.get('limit')).toBe('25');
    expect(request.headers).toMatchObject({
      authorization: 'Bearer hubspot-test',
    });
    expect(preview).toMatchObject({
      provider: 'hubspot',
      sourceLabel: 'HubSpot contacts',
      readAt: '2026-09-04T12:00:00.000Z',
      contacts: [
        expect.objectContaining({
          nativeId: '101',
          objectType: 'contact',
          fullName: 'Ada Lovelace',
          email: 'ada@example.com',
        }),
      ],
    });
  });

  it('reads Salesforce Leads without requesting write access', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        records: [
          {
            Id: '00Q1',
            FirstName: 'Grace',
            LastName: 'Hopper',
            Email: 'grace@example.com',
            Company: 'Example',
            Title: 'CTO',
            Website: 'example.com',
          },
        ],
      }),
    );

    const preview = await readCrmSource('salesforce', 10, {
      salesforceInstanceUrl: 'https://example.my.salesforce.com/path',
      salesforceAccessToken: 'salesforce-test',
      salesforceApiVersion: '67.0',
      fetchImpl: fetchImpl as typeof fetch,
    });

    const [url, request] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain('/services/data/v67.0/query');
    expect(new URL(String(url)).searchParams.get('q')).toContain(
      'FROM Lead WHERE IsConverted = FALSE',
    );
    expect(request.method).toBeUndefined();
    expect(request.headers).toMatchObject({
      authorization: 'Bearer salesforce-test',
    });
    expect(preview.contacts[0]).toMatchObject({
      nativeId: '00Q1',
      objectType: 'lead',
      fullName: 'Grace Hopper',
    });
  });

  it('preserves a provider error detail without exposing credentials', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { message: 'Missing contacts read scope' },
          { status: 403 },
        ),
      );

    await expect(
      readCrmSource('hubspot', 10, {
        hubSpotAccessToken: 'secret-value',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toThrow('HTTP 403. Missing contacts read scope');
  });
});
