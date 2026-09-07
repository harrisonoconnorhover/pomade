import {
  ProviderPendingError,
  ProviderResultError,
  ProviderSubmissionUnknownError,
  type AsyncProviderContext,
} from './async-provider';
import {
  apolloObject,
  apolloRequestId,
  apolloPhoneResult,
} from './apollo-phone';
const INTERVAL = 30_000,
  WINDOW = 30 * 60_000;
export async function executeApolloPhoneRequest(
  request: { url: string; init: RequestInit },
  context: AsyncProviderContext,
  send: (url: string, init: RequestInit) => Promise<Response>,
  readJson: (r: Response) => Promise<unknown>,
) {
  const { progress, index } = context;
  let saved = progress.state.requests[index];
  const now = Date.now();
  if (!saved) {
    await progress.saveRequest(index, {
      phase: 'submitting',
      submittedAt: now,
      nextPollAt: now,
      pollCount: 0,
    });
    let response: Response;
    try {
      response = await send(request.url, request.init);
    } catch {
      throw new ProviderSubmissionUnknownError('Apollo');
    }
    if (!response.ok) {
      await response.body?.cancel();
      if ([400, 401, 402, 403, 422, 429].includes(response.status)) {
        await progress.saveRequest(index, undefined);
        throw new Error(
          `Apollo HTTP ${response.status}; lookup rejected. Check people/phone access, callback URL and credits.`,
        );
      }
      throw new ProviderSubmissionUnknownError('Apollo');
    }
    let data: Record<string, unknown> | undefined;
    try {
      data = apolloObject(await readJson(response));
    } catch {
      throw new ProviderSubmissionUnknownError('Apollo');
    }
    const id = apolloRequestId(data?.request_id),
      person = apolloObject(data?.person);
    // A documented unmatched person response has no asynchronous lookup to resume.
    if (data && data.person === null && data.request_id == null) {
      await progress.saveRequest(index, undefined);
      return { data: { pomade: { mobile: '' } }, credits: null };
    }
    if (!id || typeof person?.id !== 'string' || !person.id)
      throw new ProviderSubmissionUnknownError('Apollo');
    await progress.saveRequest(index, {
      phase: 'waiting',
      requestId: id,
      personId: person.id,
      submittedAt: now,
      nextPollAt: now + INTERVAL,
      pollCount: 0,
      waitUntil: now + WINDOW,
    });
    throw new ProviderPendingError(
      `Waiting for Apollo mobile lookup ${id}.`,
      null,
    );
  }
  if (saved.phase === 'submitting' || !saved.requestId || !saved.personId)
    throw new ProviderSubmissionUnknownError('Apollo');
  if (saved.terminalError)
    throw new ProviderResultError(saved.terminalError, null);
  if (saved.waitUntil && now >= saved.waitUntil) {
    await progress.saveRequest(index, { ...saved, waitUntil: undefined });
    throw new ProviderResultError(
      'Apollo is still processing after 30 minutes. Resume checks the same request.',
      null,
    );
  }
  if (now < saved.nextPollAt)
    throw new ProviderPendingError(
      `Waiting for Apollo request ${saved.requestId}.`,
    );
  saved = {
    ...saved,
    pollCount: saved.pollCount + 1,
    nextPollAt: now + INTERVAL,
    waitUntil: saved.waitUntil ?? now + WINDOW,
  };
  await progress.saveRequest(index, saved);
  let credits: number | null = 0;
  try {
    const response = await send(
      new URL(`/api/v1/webhook_result/${saved.requestId}`, request.url).href,
      { ...request.init, method: 'GET', body: undefined },
    );
    const data = apolloObject(await readJson(response));
    if (response.status === 404 && data?.error_code === 'result_pending') {
      const retry =
        typeof data.retry_after_seconds === 'number' &&
        Number.isFinite(data.retry_after_seconds) &&
        data.retry_after_seconds > 0
          ? data.retry_after_seconds * 1000
          : INTERVAL;
      await progress.saveRequest(index, {
        ...saved,
        nextPollAt: now + Math.max(INTERVAL, retry),
      });
      throw new ProviderPendingError(
        `Waiting for Apollo request ${saved.requestId}.`,
      );
    }
    if (
      [400, 404, 410].includes(response.status) &&
      [
        'invalid_request_id',
        'request_id_unknown',
        'request_id_expired',
      ].includes(String(data?.error_code))
    ) {
      const terminalError = `Apollo ${String(data?.error_code)}. This saved request cannot be polled again; review before starting a new run.`;
      await progress.saveRequest(index, { ...saved, terminalError });
      throw new Error(terminalError);
    }
    if (!response.ok)
      throw new Error(
        `Apollo HTTP ${response.status} while checking the saved request.`,
      );
    if (
      !data ||
      apolloRequestId(data.request_id) !== saved.requestId ||
      data.request_type !== 'phone'
    )
      throw new Error(
        'Apollo returned a different request or enrichment type; results withheld.',
      );
    const payload = apolloObject(data.webhook_result);
    // Delivery can fail while the enrichment payload remains available for polling.
    if (!payload && data.webhook_status === 'in_progress')
      throw new ProviderPendingError(
        `Waiting for Apollo request ${saved.requestId}.`,
      );
    if (!payload || payload.status !== 'success')
      throw new Error('Apollo did not return a completed phone result.');
    const total = payload.credits_consumed;
    if (typeof total === 'number' && Number.isFinite(total) && total >= 0) {
      credits = Math.max(0, total - (saved.reportedCredits ?? 0));
      saved = {
        ...saved,
        reportedCredits: Math.max(total, saved.reportedCredits ?? 0),
      };
      await progress.saveRequest(index, saved);
    } else credits = saved.reportedCredits === undefined ? null : 0;
    const person =
      Array.isArray(payload.people) && payload.people.length === 1
        ? apolloObject(payload.people[0])
        : undefined;
    if (!person || person.id !== saved.personId || person.status !== 'success')
      throw new Error(
        'Apollo returned no uniquely matching successful person result; results withheld.',
      );
    return { data: apolloPhoneResult(person), credits };
  } catch (error) {
    if (error instanceof ProviderPendingError) throw error;
    throw new ProviderResultError(
      error instanceof Error
        ? error.message
        : 'Apollo result could not be read. Resume checks the saved request.',
      credits,
    );
  }
}
