export type ProviderAccount = {
  id: string;
  name: string;
  configured: boolean;
  status: 'ready' | 'unavailable' | 'not_connected' | 'configured';
  plan?: string;
  remaining?: number;
  used?: number;
  resetsAt?: string;
  unit?: string;
  note: string;
  dashboard: string;
};
type AccountEnv = {
  PROSPEO_API_KEY?: string;
  HUNTER_API_KEY?: string;
  PARALLEL_API_KEY?: string;
  APOLLO_API_KEY?: string;
};
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
export async function providerAccounts(
  env: AccountEnv,
  fetcher: typeof fetch = fetch,
): Promise<ProviderAccount[]> {
  const statuses = await Promise.all([
    (async (): Promise<ProviderAccount> => {
      const account: ProviderAccount = {
        id: 'prospeo',
        name: 'Prospeo',
        configured: Boolean(env.PROSPEO_API_KEY),
        status: 'not_connected',
        unit: 'credits',
        dashboard: 'https://app.prospeo.io',
        note: 'Verified email and mobile. Up to 10 credits per verified mobile; no match is free.',
      };
      if (!env.PROSPEO_API_KEY) return account;
      try {
        const r = await fetcher('https://api.prospeo.io/account-information', {
          headers: { 'X-KEY': env.PROSPEO_API_KEY },
          signal: AbortSignal.timeout(10000),
          cache: 'no-store',
        });
        const body = (await r.json()) as {
          error?: boolean;
          response?: {
            current_plan?: string;
            remaining_credits?: number;
            used_credits?: number;
            next_quota_renewal_date?: string;
          };
        };
        if (!r.ok || body.error || !body.response)
          return {
            ...account,
            status: 'unavailable',
            note: `Balance unavailable (HTTP ${r.status}). Check the provider account.`,
          };
        return {
          ...account,
          status: 'ready',
          plan: body.response.current_plan,
          remaining: number(body.response.remaining_credits),
          used: number(body.response.used_credits),
          resetsAt: body.response.next_quota_renewal_date,
        };
      } catch {
        return {
          ...account,
          status: 'unavailable',
          note: 'Could not reach Prospeo. Check again or open its dashboard.',
        };
      }
    })(),
    (async (): Promise<ProviderAccount> => {
      const account: ProviderAccount = {
        id: 'hunter',
        name: 'Hunter',
        configured: Boolean(env.HUNTER_API_KEY),
        status: 'not_connected',
        unit: 'search credits',
        dashboard: 'https://hunter.io/dashboard',
        note: 'Work email discovery and verification.',
      };
      if (!env.HUNTER_API_KEY) return account;
      try {
        const r = await fetcher('https://api.hunter.io/v2/account', {
          headers: { 'X-API-KEY': env.HUNTER_API_KEY },
          signal: AbortSignal.timeout(10000),
          cache: 'no-store',
        });
        const body = (await r.json()) as {
          data?: {
            plan_name?: string;
            reset_date?: string;
            requests?: {
              searches?: {
                available?: number;
                used?: number;
                remaining?: number;
              };
            };
          };
        };
        if (!r.ok || !body.data)
          return {
            ...account,
            status: 'unavailable',
            note: `Balance unavailable (HTTP ${r.status}). Check the provider account.`,
          };
        const usage = body.data.requests?.searches,
          available = number(usage?.available),
          used = number(usage?.used);
        return {
          ...account,
          status: 'ready',
          plan: body.data.plan_name,
          resetsAt: body.data.reset_date,
          used,
          remaining:
            number(usage?.remaining) ??
            (available === undefined || used === undefined
              ? undefined
              : Math.max(0, available - used)),
        };
      } catch {
        return {
          ...account,
          status: 'unavailable',
          note: 'Could not reach Hunter. Check again or open its dashboard.',
        };
      }
    })(),
  ]);
  return [
    ...statuses,
    {
      id: 'parallel',
      name: 'Parallel',
      configured: Boolean(env.PARALLEL_API_KEY),
      status: env.PARALLEL_API_KEY ? 'configured' : 'not_connected',
      note: 'Web research. This connection does not report a balance; check your trial allowance in Parallel.',
      dashboard: 'https://platform.parallel.ai',
    },
    {
      id: 'apollo',
      name: 'Apollo',
      configured: Boolean(env.APOLLO_API_KEY),
      status: env.APOLLO_API_KEY ? 'configured' : 'not_connected',
      note: 'Company enrichment. People API access depends on the account. Check credits in Apollo.',
      dashboard: 'https://app.apollo.io',
    },
  ];
}
