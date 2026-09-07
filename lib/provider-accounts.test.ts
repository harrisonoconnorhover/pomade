import { describe, it, expect, vi } from 'vitest';
import { providerAccounts } from './provider-accounts';
import {
  createProspeoMobileColumns,
  PROSPEO_CONNECTION,
} from './provider-presets';
import { executeProviderWaterfall } from './provider-waterfall';
import { createTable } from './workbook';
import {
  columnResearchEnvironment,
  researchConfiguration,
} from './research-provider';
describe('free provider connections', () => {
  it('returns only balance data, uses the reported Hunter remaining value, and leaves unknown balances unknown', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          response: {
            current_plan: 'FREE',
            remaining_credits: 90,
            used_credits: 10,
            email: 'private@example.test',
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            plan_name: 'Free',
            email: 'private@example.test',
            requests: { searches: { available: 100, used: 30, remaining: 65 } },
          },
        }),
      );
    const result = await providerAccounts(
      {
        PROSPEO_API_KEY: 'secret',
        HUNTER_API_KEY: 'secret',
        PARALLEL_API_KEY: 'secret',
      },
      fetchImpl,
    );
    expect(result[0].remaining).toBe(90);
    expect(result[1].remaining).toBe(65);
    expect(result[2].remaining).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('private@example.test');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it.each([
    ['VERIFIED', true, '+12025550123', true],
    ['VERIFIED', false, '+12025550123', false],
    ['UNKNOWN', true, '+12025550123', false],
    ['VERIFIED', true, '+1202***0123', false],
  ])(
    'accepts only a verified, revealed, unmasked mobile (%s/%s)',
    async (status, revealed, mobile, accepted) => {
      const w = createTable({ id: 't', name: 'Contacts', mode: 'empty' });
      w.rows = [
        {
          id: 'person',
          values: { person: 'Example Person', domain: 'example.com' },
        },
      ];
      const columns = createProspeoMobileColumns(w, 'person', 'domain');
      w.columns.push(...columns);
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ person: { mobile: { status, revealed, mobile } } }),
        );
      const result = await executeProviderWaterfall(
        w,
        'person',
        columns[0],
        [
          {
            id: PROSPEO_CONNECTION,
            label: 'Prospeo',
            origin: 'https://api.prospeo.io',
            methods: ['POST'],
            headers: { 'X-KEY': 'secret' },
          },
        ],
        fetchImpl,
      );
      expect(Boolean(result.workspace.rows[0].values.verified_mobile)).toBe(
        accepted,
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );
  it('selects a provider per column without changing the installation default', () => {
    const env = { POMADE_RESEARCH_PROVIDER: 'codex', PARALLEL_API_KEY: 'key' };
    expect(
      researchConfiguration(
        columnResearchEnvironment(env, { researchProvider: 'parallel' }),
      ).provider,
    ).toBe('parallel');
    expect(researchConfiguration(env).provider).toBe('codex');
  });
});
