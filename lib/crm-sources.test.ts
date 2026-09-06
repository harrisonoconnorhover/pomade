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
      fields: ['industry'],
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
      objectType: 'contact',
      fields: ['industry'],
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
    expect(preview.objectType).toBe('lead');
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

describe('company and contact round-trip reads', () => {
  it('reads HubSpot companies by native IDs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        results: [
          {
            id: '7',
            properties: {
              name: 'Example',
              domain: 'example.com',
              description: 'Research',
            },
          },
        ],
      }),
    );
    const p = await readCrmSource('hubspot', 10, {
      hubSpotAccessToken: 'test',
      objectType: 'company',
      recordIds: ['7'],
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(p.contacts[0]).toMatchObject({
      objectType: 'company',
      nativeId: '7',
      company: 'Example',
      description: 'Research',
    });
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST');
    expect(String(fetchImpl.mock.calls[0][0])).toContain(
      '/companies/batch/read',
    );
  });
  it('reads Salesforce contacts with their associated account', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        records: [
          {
            Id: '0031',
            FirstName: 'Ada',
            LastName: 'Lovelace',
            Email: 'ada@example.com',
            AccountId: '0011',
            Account: { Name: 'Example', Website: 'example.com' },
          },
        ],
      }),
    );
    const p = await readCrmSource('salesforce', 10, {
      salesforceAccessToken: 'test',
      salesforceInstanceUrl: 'https://dev.my.salesforce.com',
      objectType: 'contact',
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(p.contacts[0]).toMatchObject({
      objectType: 'contact',
      company: 'Example',
      accountId: '0011',
      website: 'example.com',
    });
    expect(
      new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('q'),
    ).toContain('FROM Contact');
  });
  it('rejects invalid object/record filters before any API request', async () => {
    const fetchImpl = vi.fn();
    await expect(
      readCrmSource('salesforce', 10, {
        recordIds: ["x' OR Id != ''"],
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toThrow('Invalid CRM record IDs');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
