import { describe, expect, it, vi } from 'vitest';
import { createTable } from './workbook';
import { emailProviderStep, leadMagicMobileStep } from './provider-presets';
import { configuredHttpConnections } from './provider-connections';
import { publicHttpConnections } from './http-enrichment';
import {
  createProviderWaterfall,
  executeProviderWaterfall,
} from './provider-waterfall';

function fixture(mobile = false) {
  const w = createTable({
    id: 'leadmagic',
    name: 'Provider test',
    mode: 'empty',
  });
  w.columns.push({
    id: 'work_email',
    title: 'Work email',
    kind: 'text',
    width: 180,
  });
  w.rows = [
    {
      id: 'a',
      values: {
        person: 'Ada Example',
        domain: 'example.com',
        work_email: 'ada@example.com',
      },
    },
  ];
  const columns = createProviderWaterfall(w, {
    id: 'result',
    title: mobile ? 'Mobile lookup' : 'Verified work email',
    steps: mobile
      ? [leadMagicMobileStep('work_email')]
      : [emailProviderStep('leadmagic'), emailProviderStep('hunter')],
    accept: mobile ? 'phone' : 'verified-email',
    continueOnError: false,
  });
  w.columns.push(...columns);
  return { w, column: columns[0] };
}
const connections = configuredHttpConnections({
  LEADMAGIC_API_KEY: 'private-test-key',
  HUNTER_API_KEY: 'hunter-test-key',
});

describe('LeadMagic presets with documented response fixtures', () => {
  it('sends mapped identity and server-side authentication, then stops on a valid email', async () => {
    const { w, column } = fixture();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, init) => {
        expect(new URL(url instanceof Request ? url.url : url).href).toBe(
          'https://api.leadmagic.io/v1/people/email-finder',
        );
        expect(JSON.parse(init?.body as string)).toEqual({
          full_name: 'Ada Example',
          domain: 'example.com',
        });
        expect(new Headers(init?.headers).get('X-API-Key')).toBe(
          'private-test-key',
        );
        return Response.json({
          email: 'ada@example.com',
          status: 'valid',
          credits_consumed: 1,
        });
      });
    const result = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.receipt.status).toBe('passed');
    expect(result.workspace.rows[0].values.result_provider).toBe('LeadMagic');
    expect(JSON.stringify(result)).not.toContain('private-test-key');
    expect(JSON.stringify(publicHttpConnections(connections))).not.toContain(
      'private-test-key',
    );
  });
  it.each([null, 'unknown', 'valid_catch_all', 'catch_all'])(
    'falls through to Hunter for an unaccepted email status %s',
    async (status) => {
      const { w, column } = fixture();
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({
            email: status === null ? null : 'candidate@example.com',
            status,
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            data: {
              email: 'ada@example.com',
              verification: { status: 'valid' },
            },
          }),
        );
      const result = await executeProviderWaterfall(
        w,
        'a',
        column,
        connections,
        fetcher,
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(result.workspace.rows[0].values.result_provider).toBe('Hunter');
      expect(result.receipt.attempts?.[0].status).toBe('review');
    },
  );
  it('makes no request without a key or a required input', async () => {
    const { w, column } = fixture(true),
      fetcher = vi.fn<typeof fetch>();
    const missingKey = await executeProviderWaterfall(
      w,
      'a',
      column,
      configuredHttpConnections({}),
      fetcher,
    );
    expect(missingKey.receipt.error).toContain('not configured');
    w.rows[0].values.work_email = '';
    const missingEmail = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      fetcher,
    );
    expect(missingEmail.receipt.status).toBe('review');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns a country-coded mobile with format-only acceptance and refuses to call it verified', async () => {
    const { w, column } = fixture(true);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, init) => {
        expect(new URL(url instanceof Request ? url.url : url).href).toBe(
          'https://api.leadmagic.io/v1/people/mobile-finder',
        );
        expect(JSON.parse(init?.body as string)).toEqual({
          work_email: 'ada@example.com',
        });
        return Response.json({
          mobile_number: '+1 (202) 555-0123',
          message: 'Mobile number found.',
          credits_consumed: 5,
        });
      });
    const result = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      fetcher,
    );
    expect(result.workspace.rows[0].values.result).toBe('+12025550123');
    expect(column.providerWaterfall?.accept).toBe('phone');
    await expect(
      executeProviderWaterfall(
        w,
        'a',
        {
          ...column,
          providerWaterfall: {
            ...column.providerWaterfall!,
            accept: 'verified-phone',
          },
        },
        connections,
        fetcher,
      ),
    ).rejects.toThrow('verification status');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const noResult = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      async () => Response.json({ mobile_number: null }),
    );
    expect(noResult.workspace.rows[0].values.result).toBe('');
    expect(noResult.receipt.status).toBe('review');
  });
  it('stops on missing entitlements or rate limits instead of spending on the fallback', async () => {
    const { w, column } = fixture();
    for (const status of [403, 429]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('', { status }));
      const result = await executeProviderWaterfall(
        w,
        'a',
        column,
        connections,
        fetcher,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result.receipt.error).toBe('HTTP ' + status);
    }
  });
});
