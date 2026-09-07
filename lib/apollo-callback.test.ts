import { describe, it, expect, vi } from 'vitest';
import {
  apolloCallbackUrl,
  checkManagedApolloCallback,
} from './apollo-callback';
import { configuredHttpConnections } from './provider-connections';
import { publicHttpConnections } from './http-enrichment';
const url = 'https://callback.example.test/apollo/independent-receipt-token';
describe('Apollo callback selection and readiness', () => {
  it('uses the installation default with a personal API key, keeping it out of public connection data', () => {
    const env = {
      POMADE_APOLLO_CALLBACK_URL: url,
      APOLLO_API_KEY: 'personal-secret',
    };
    const connections = configuredHttpConnections(env);
    expect(
      connections.find((c) => c.id === 'pomade_apollo_phone')?.callbackUrl,
    ).toBe(url);
    expect(JSON.stringify(publicHttpConnections(connections))).not.toMatch(
      /receipt-token|personal-secret|callbackUrl/,
    );
    expect(
      configuredHttpConnections({ POMADE_APOLLO_CALLBACK_URL: url }),
    ).toHaveLength(0);
    expect(
      apolloCallbackUrl({
        ...env,
        APOLLO_WEBHOOK_URL: 'https://custom.example.test/callback',
      }),
    ).toBe('https://custom.example.test/callback');
    expect(
      apolloCallbackUrl({
        ...env,
        APOLLO_WEBHOOK_URL: 'http://localhost/callback',
      }),
    ).toBeUndefined();
  });
  it('probes only the managed receiver with synthetic data and no authentication', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          service: 'pomade-apollo-callback',
          mode: 'acknowledge-only',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          service: 'pomade-apollo-callback',
          mode: 'acknowledge-only',
          received: true,
        }),
      );
    expect(
      await checkManagedApolloCallback(
        {
          POMADE_APOLLO_CALLBACK_URL: url,
          APOLLO_WEBHOOK_URL: 'https://custom.example.test/callback',
        },
        fetcher,
      ),
    ).toContain('No Apollo credits');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.every(
        ([target, init]) => target === url && init?.redirect === 'error',
      ),
    ).toBe(true);
    const request = fetcher.mock.calls[1][1]!;
    expect(request.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(request.body as string)).toEqual({
      status: 'success',
      people: [],
      total_requested_enrichments: 0,
    });
  });
  it('does not call an unconfigured receiver or claim success for a login page or failed delivery', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(checkManagedApolloCallback({}, fetcher)).rejects.toThrow(
      'not configured',
    );
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    await expect(
      checkManagedApolloCallback({ POMADE_APOLLO_CALLBACK_URL: url }, fetcher),
    ).rejects.toThrow('not reachable');
    fetcher
      .mockResolvedValueOnce(
        Response.json({
          service: 'pomade-apollo-callback',
          mode: 'acknowledge-only',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          service: 'pomade-apollo-callback',
          mode: 'acknowledge-only',
        }),
      );
    await expect(
      checkManagedApolloCallback({ POMADE_APOLLO_CALLBACK_URL: url }, fetcher),
    ).rejects.toThrow('did not acknowledge');
  });
});
