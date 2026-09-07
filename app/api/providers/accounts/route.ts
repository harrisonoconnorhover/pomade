import { env } from 'cloudflare:workers';
import { providerAccounts } from '@/lib/provider-accounts';
export async function GET() {
  return Response.json(
    { accounts: await providerAccounts(env), checkedAt: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
