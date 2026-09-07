import { validApolloCallback } from './apollo-phone';

export type ApolloCallbackEnvironment = {
  APOLLO_WEBHOOK_URL?: string;
  POMADE_APOLLO_CALLBACK_URL?: string;
};

export function apolloCallbackUrl(env: ApolloCallbackEnvironment) {
  // An explicit custom value wins, including an invalid one: do not silently
  // deliver contact data to another receiver after a configuration mistake.
  const url =
    env.APOLLO_WEBHOOK_URL?.trim() || env.POMADE_APOLLO_CALLBACK_URL?.trim();
  return validApolloCallback(url) ? url : undefined;
}

export async function checkManagedApolloCallback(
  env: ApolloCallbackEnvironment,
  fetcher: typeof fetch = fetch,
) {
  const url = env.POMADE_APOLLO_CALLBACK_URL?.trim();
  if (!validApolloCallback(url))
    throw new Error('The Pomade callback is not configured.');
  // Only probe the deployment owner's configured receiver. Do not fetch a
  // user-supplied URL or send an Apollo key, real contact, or Sites credential.
  for (const method of ['GET', 'POST']) {
    const response = await fetcher(url!, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      ...(method === 'POST'
        ? {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              status: 'success',
              people: [],
              total_requested_enrichments: 0,
            }),
          }
        : {}),
    });
    if (!response.ok) throw new Error('The Pomade callback is not reachable.');
    const data = (await response.json()) as Record<string, unknown>;
    if (
      data.service !== 'pomade-apollo-callback' ||
      data.mode !== 'acknowledge-only' ||
      (method === 'POST' && data.received !== true)
    )
      throw new Error('The Pomade callback did not acknowledge the test.');
  }
  return 'The public Pomade callback received a test delivery. No Apollo credits used. Phone lookup access still needs an eligible Apollo key.';
}
