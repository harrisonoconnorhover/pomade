export type SalesforceAuth = {
  salesforceAccessToken?: string;
  salesforceInstanceUrl?: string;
  salesforceRefreshToken?: string;
  salesforceClientId?: string;
  salesforceClientSecret?: string;
  salesforceLoginUrl?: string;
  fetchImpl?: typeof fetch;
};
const sessions = new Map<
  string,
  { token?: string; pending?: Promise<string> }
>();
function origin(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !/(^|\.)(salesforce\.com|force\.com)$/.test(url.hostname)
  )
    throw new Error('Use a Salesforce HTTPS login or instance URL.');
  return url.origin;
}
export async function salesforceFetch(
  options: SalesforceAuth,
  url: string | URL,
  init: RequestInit,
): Promise<Response> {
  const instance = origin(options.salesforceInstanceUrl ?? '');
  const target = new URL(url);
  if (target.origin !== instance || !target.pathname.startsWith('/services/'))
    throw new Error('Salesforce requests must use the configured instance.');
  const fetcher = options.fetchImpl ?? fetch;
  const key = options.salesforceRefreshToken
    ? `${instance}:${options.salesforceClientId}:${options.salesforceRefreshToken}`
    : '';
  const session = key ? (sessions.get(key) ?? {}) : {};
  if (key) sessions.set(key, session);
  async function renew() {
    if (!options.salesforceRefreshToken || !options.salesforceClientId)
      throw new Error(
        'Salesforce session expired. Reconnect the account or configure token renewal.',
      );
    if (!session.pending)
      session.pending = (async () => {
        const login = origin(options.salesforceLoginUrl ?? instance);
        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: options.salesforceClientId!,
          refresh_token: options.salesforceRefreshToken!,
        });
        if (options.salesforceClientSecret)
          body.set('client_secret', options.salesforceClientSecret);
        const response = await fetcher(login + '/services/oauth2/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
        });
        const result = (await response.json().catch(() => ({}))) as {
          access_token?: string;
          instance_url?: string;
        };
        if (!response.ok || !result.access_token)
          throw new Error(
            `Salesforce session renewal failed (HTTP ${response.status}). Reconnect the account.`,
          );
        if (result.instance_url && origin(result.instance_url) !== instance)
          throw new Error(
            'Salesforce renewal returned a different account instance. Check the connection.',
          );
        session.token = result.access_token;
        return result.access_token;
      })().finally(() => {
        session.pending = undefined;
      });
    return session.pending;
  }
  async function send(token: string) {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    return fetcher(url, {
      ...init,
      headers: Object.fromEntries(headers.entries()),
      redirect: 'manual',
    });
  }
  const token =
    session.token ?? options.salesforceAccessToken ?? (await renew());
  const response = await send(token);
  if (
    response.status !== 401 ||
    !options.salesforceRefreshToken ||
    !options.salesforceClientId
  )
    return response;
  await response.body?.cancel();
  // A rejected authentication request has no CRM side effect. Network errors and 5xx writes are never retried here.
  const renewed =
    session.token && session.token !== token ? session.token : await renew();
  return send(renewed);
}
export function salesforceRenewalEnvironment(env: {
  SALESFORCE_REFRESH_TOKEN?: string;
  SALESFORCE_CLIENT_ID?: string;
  SALESFORCE_CLIENT_SECRET?: string;
  SALESFORCE_LOGIN_URL?: string;
}) {
  return {
    salesforceRefreshToken: env.SALESFORCE_REFRESH_TOKEN,
    salesforceClientId: env.SALESFORCE_CLIENT_ID,
    salesforceClientSecret: env.SALESFORCE_CLIENT_SECRET,
    salesforceLoginUrl: env.SALESFORCE_LOGIN_URL,
  };
}
