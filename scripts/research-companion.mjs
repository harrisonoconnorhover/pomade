// Outbound-only connection. The local Codex helper and its login stay on the Mac.
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

/** @param {Record<string, string | undefined>} env */
export function companionConfiguration(env = process.env) {
  const site = new URL(env.POMADE_HOSTED_URL || 'https://invalid.local');
  if (
    !env.POMADE_HOSTED_URL ||
    site.protocol !== 'https:' ||
    site.username ||
    site.password ||
    site.pathname !== '/' ||
    site.search ||
    site.hash
  )
    throw new Error(
      'Set POMADE_HOSTED_URL to your HTTPS Pomade website origin.',
    );
  const helper = new URL(env.POMADE_CODEX_URL || 'http://127.0.0.1:9876');
  if (
    helper.protocol !== 'http:' ||
    helper.hostname !== '127.0.0.1' ||
    helper.username ||
    helper.password ||
    helper.pathname !== '/' ||
    helper.search ||
    helper.hash
  )
    throw new Error('The research helper must use http://127.0.0.1:<port>.');
  if (
    !/^[A-Za-z0-9_-]{40,160}$/.test(env.POMADE_COMPANION_TOKEN || '') ||
    !env.POMADE_SITES_TOKEN ||
    !env.POMADE_CODEX_TOKEN
  )
    throw new Error(
      'Configure the companion, Sites and local Codex connection tokens.',
    );
  return {
    site: site.origin,
    helper: helper.origin,
    companionToken: env.POMADE_COMPANION_TOKEN,
    sitesToken: env.POMADE_SITES_TOKEN,
    helperToken: env.POMADE_CODEX_TOKEN,
  };
}

/**
 * @param {ReturnType<typeof companionConfiguration>} config
 * @param {{signal?: AbortSignal, fetchImpl?: typeof fetch, pollMs?: number, outbox?: string, log?: (message: string) => void}} options
 */
export async function runCompanion(
  config,
  {
    signal,
    fetchImpl = fetch,
    pollMs = 3_000,
    outbox = resolve('outputs/companion-outbox.json'),
    log = console.log,
  } = {},
) {
  let busy = false;
  let ready = false;
  let browserAvailable = false;
  const siteRequest = async (body) => {
    const response = await fetchImpl(`${config.site}/api/companion`, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${config.companionToken}`,
        'OAI-Sites-Authorization': `Bearer ${config.sitesToken}`,
      },
      body: JSON.stringify(body),
    });
    if (response.status === 409 && body.action === 'finish')
      return { accepted: false };
    if (!response.ok)
      throw new Error(
        `Hosted connection returned ${response.status}. Check the companion connection settings.`,
      );
    return response.json();
  };
  const heartbeat = async (claim = false) => {
    try {
      const response = await fetchImpl(`${config.helper}/status`, {
        headers: { Authorization: `Bearer ${config.helperToken}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(12_000),
      });
      const status = response.ok ? await response.json() : {};
      ready = status.configured === true;
      browserAvailable = status.browserAvailable === true;
    } catch {
      ready = false;
    }
    return siteRequest({
      action: 'poll',
      ready,
      browserAvailable,
      claim: claim && !busy,
    });
  };
  // Keep the hosted status current while a research job is using the helper.
  const timer = setInterval(() => {
    if (busy) void heartbeat().catch(() => {});
  }, 15_000);
  timer.unref();
  const flush = async () => {
    let pending;
    try {
      pending = JSON.parse(await readFile(outbox, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    // Persist the result until the website acknowledges it, including after restart.
    await siteRequest(pending);
    await unlink(outbox);
  };
  log('Pomade companion connected. Leave this running for hosted research.');
  try {
    while (!signal?.aborted) {
      try {
        await flush();
        const { job } = await heartbeat(true);
        if (job) {
          busy = true;
          let completion;
          try {
            const response = await fetchImpl(`${config.helper}/research`, {
              method: 'POST',
              redirect: 'manual',
              signal: AbortSignal.timeout(265_000),
              headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${config.helperToken}`,
              },
              body: JSON.stringify({
                prompt: job.prompt,
                model: job.model || undefined,
                browser: job.browser === 1,
              }),
            });
            completion = response.ok
              ? { result: await response.json() }
              : {
                  error: `Local research returned ${response.status}. Check the Codex helper.`,
                  retry: [429, 503].includes(response.status),
                };
          } catch {
            completion = {
              error:
                'The Mac research connection was interrupted. Resume the background run to retry.',
            };
          }
          await mkdir(dirname(outbox), { recursive: true });
          await writeFile(
            outbox,
            JSON.stringify({
              action: 'finish',
              id: job.id,
              leaseToken: job.lease_token,
              ...completion,
            }),
            { mode: 0o600 },
          );
          await flush();
          busy = false;
        }
      } catch (error) {
        busy = false;
        log(
          error instanceof Error
            ? error.message
            : 'Companion connection unavailable; reconnecting.',
        );
      }
      await delay(pollMs, undefined, { signal }).catch(() => {});
    }
  } finally {
    clearInterval(timer);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  await runCompanion(companionConfiguration(), { signal: controller.signal });
}
