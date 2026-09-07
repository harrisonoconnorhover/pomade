import { describe, it, expect, vi } from 'vitest';
import { salesforceFetch } from './salesforce-auth';
const options = () => ({
  salesforceInstanceUrl: 'https://example.my.salesforce.com',
  salesforceAccessToken: 'expired',
  salesforceClientId: 'app',
  salesforceRefreshToken: crypto.randomUUID(),
});
describe('Salesforce session renewal', () => {
  it('renews an expired session and retries only the authentication-rejected request', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'renewed',
          instance_url: 'https://example.my.salesforce.com',
        }),
      )
      .mockResolvedValueOnce(Response.json({ records: [] }));
    const response = await salesforceFetch(
      { ...options(), fetchImpl },
      'https://example.my.salesforce.com/services/data/v67.0/query',
      { method: 'GET' },
    );
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'https://example.my.salesforce.com/services/oauth2/token',
    );
    expect(
      new URLSearchParams(fetchImpl.mock.calls[1][1]?.body as string).get(
        'grant_type',
      ),
    ).toBe('refresh_token');
    expect(
      new Headers(fetchImpl.mock.calls[2][1]?.headers).get('authorization'),
    ).toBe('Bearer renewed');
  });
  it('never repeats a write after an ambiguous server failure', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 500 }));
    const response = await salesforceFetch(
      { ...options(), fetchImpl },
      'https://example.my.salesforce.com/services/data/v67.0/sobjects/Account',
      { method: 'POST', body: '{}' },
    );
    expect(response.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('holds a renewal for another instance and keeps returned credentials out of the error', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'private',
          instance_url: 'https://other.my.salesforce.com',
        }),
      );
    await expect(
      salesforceFetch(
        { ...options(), fetchImpl },
        'https://example.my.salesforce.com/services/data/v67.0/query',
        {},
      ),
    ).rejects.toThrow('different account instance');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
