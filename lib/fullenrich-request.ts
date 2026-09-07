import {
  ProviderPendingError,
  ProviderResultError,
  ProviderSubmissionUnknownError,
  type AsyncProviderContext,
} from './async-provider';
import {
  FULLENRICH_POLL_INTERVAL_MS,
  FULLENRICH_WAIT_WINDOW_MS,
  validateFullEnrichRequest,
  fullEnrichObject,
  fullEnrichContactResult,
} from './fullenrich';

export async function executeFullEnrichRequest(
  request: { url: string; init: RequestInit },
  context: AsyncProviderContext,
  send: (url: string, init: RequestInit) => Promise<Response>,
  readJson: (response: Response) => Promise<unknown>,
) {
  const url = new URL(request.url);
  if (request.init.method !== 'POST')
    throw new Error('Use a FullEnrich preset with background polling.');
  const { input, contact } = validateFullEnrichRequest(
    url,
    request.init.body as string | undefined,
  );
  const { progress, index } = context;
  let saved = progress.state.requests[index];
  const now = Date.now();
  if (!saved) {
    const correlationId = crypto.randomUUID();
    // FullEnrich documents no submission idempotency key. Claim before POST,
    // and never guess whether a lost response created a billable enrichment.
    await progress.saveRequest(index, {
      phase: 'submitting',
      correlationId,
      submittedAt: now,
      nextPollAt: now,
      pollCount: 0,
    });
    let response: Response;
    try {
      response = await send(request.url, {
        ...request.init,
        body: JSON.stringify({
          ...input,
          data: [{ ...contact, custom: { pomade_request: correlationId } }],
        }),
      });
    } catch {
      throw new ProviderSubmissionUnknownError('FullEnrich');
    }
    if (!response.ok) {
      await response.body?.cancel();
      if ([400, 401, 402, 429].includes(response.status)) {
        await progress.saveRequest(index, undefined);
        throw new Error(
          `FullEnrich HTTP ${response.status}; lookup rejected. Check inputs, API access, or credits before resuming.`,
        );
      }
      throw new ProviderSubmissionUnknownError('FullEnrich');
    }
    let id: unknown;
    try {
      id = fullEnrichObject(await readJson(response))?.enrichment_id;
    } catch {
      throw new ProviderSubmissionUnknownError('FullEnrich');
    }
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id))
      throw new ProviderSubmissionUnknownError('FullEnrich');
    await progress.saveRequest(index, {
      phase: 'waiting',
      requestId: id,
      correlationId,
      submittedAt: now,
      nextPollAt: now + FULLENRICH_POLL_INTERVAL_MS,
      pollCount: 0,
      waitUntil: now + FULLENRICH_WAIT_WINDOW_MS,
    });
    throw new ProviderPendingError(
      `Waiting for FullEnrich. Request ID: ${id}. First result check in five minutes; enrichment credits are reported with the results.`,
      null,
    );
  }
  if (saved.phase === 'submitting' || !saved.requestId || !saved.correlationId)
    throw new ProviderSubmissionUnknownError('FullEnrich');
  if (saved.waitUntil && now >= saved.waitUntil) {
    await progress.saveRequest(index, { ...saved, waitUntil: undefined });
    throw new ProviderResultError(
      `FullEnrich is still processing after 30 minutes. Resume to keep checking request ${saved.requestId}; no new lookup will be submitted.`,
    );
  }
  if (now < saved.nextPollAt)
    throw new ProviderPendingError(
      `Waiting for FullEnrich. Request ID: ${saved.requestId}. Next result check: ${new Date(saved.nextPollAt).toISOString()} (at least five minutes between checks).`,
    );
  saved = {
    ...saved,
    pollCount: saved.pollCount + 1,
    nextPollAt: now + FULLENRICH_POLL_INTERVAL_MS,
    waitUntil: saved.waitUntil ?? now + FULLENRICH_WAIT_WINDOW_MS,
  };
  await progress.saveRequest(index, saved);
  let credits: number | null = 0;
  try {
    const response = await send(`${url.href}/${saved.requestId}`, {
      ...request.init,
      method: 'GET',
      body: undefined,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `FullEnrich HTTP ${response.status} while checking request ${saved.requestId}. Resume to check the same request again.`,
      );
    }
    const data = fullEnrichObject(await readJson(response));
    if (!data || data.id !== saved.requestId)
      throw new Error(
        'FullEnrich returned a different or missing request ID; results withheld.',
      );
    const total = fullEnrichObject(data.cost)?.credits;
    // Cost is the cumulative enrichment charge, not a price for each poll.
    // Save the observed total so checking the same result cannot count it twice.
    if (typeof total === 'number' && Number.isFinite(total) && total >= 0) {
      credits = Math.max(0, total - (saved.reportedCredits ?? 0));
      saved = {
        ...saved,
        reportedCredits: Math.max(total, saved.reportedCredits ?? 0),
      };
      await progress.saveRequest(index, saved);
    } else if (data.status === 'FINISHED')
      credits = saved.reportedCredits === undefined ? null : 0;
    if (
      response.status === 202 ||
      ['CREATED', 'IN_PROGRESS'].includes(String(data.status))
    )
      throw new ProviderPendingError(
        `Waiting for FullEnrich. Request ID: ${saved.requestId}. Next result check in five minutes.`,
        credits,
      );
    if (data.status !== 'FINISHED')
      throw new Error(
        `FullEnrich request ${saved.requestId} did not finish (${['CANCELED', 'CREDITS_INSUFFICIENT', 'RATE_LIMIT', 'UNKNOWN'].includes(String(data.status)) ? String(data.status) : 'unrecognized status'}). Review the request before resuming.`,
      );
    const record =
      Array.isArray(data.data) && data.data.length === 1
        ? fullEnrichObject(data.data[0])
        : undefined;
    if (
      !record ||
      fullEnrichObject(record.custom)?.pomade_request !== saved.correlationId
    )
      throw new Error(
        'FullEnrich returned no uniquely matching contact; results withheld.',
      );
    const echoed = fullEnrichObject(record.input);
    for (const [key, resultKey] of [
      ['first_name', 'first_name'],
      ['last_name', 'last_name'],
      ['domain', 'company_domain'],
      ['linkedin_url', 'professional_network_url'],
    ]) {
      const original = contact[key],
        returned = echoed?.[resultKey];
      if (
        original !== undefined &&
        returned !== undefined &&
        (typeof original !== 'string' ||
          typeof returned !== 'string' ||
          original.trim().replace(/\/$/, '').toLowerCase() !==
            returned.trim().replace(/\/$/, '').toLowerCase())
      )
        throw new Error(
          'FullEnrich returned conflicting contact inputs; results withheld.',
        );
    }
    return {
      data: fullEnrichContactResult(
        record,
        (contact.enrich_fields as string[])[0],
      ),
      credits,
    };
  } catch (error) {
    if (error instanceof ProviderPendingError) throw error;
    throw new ProviderResultError(
      error instanceof Error
        ? error.message
        : 'FullEnrich result could not be read. Resume to check the saved request.',
      credits,
    );
  }
}
