import type { WaterfallProgress } from '../db/waterfall-progress';
import {
  EnrowPendingError,
  EnrowSubmissionUnknownError,
  enrowResult,
  validateEnrowRequest,
  ENROW_POLL_INTERVAL_MS,
  ENROW_WAIT_WINDOW_MS,
} from './enrow';

export type EnrowContext = { progress: WaterfallProgress; index: number };

export async function executeEnrowRequest(
  request: { url: string; init: RequestInit },
  context: EnrowContext,
  send: (url: string, init: RequestInit) => Promise<Response>,
  readJson: (response: Response) => Promise<unknown>,
) {
  const url = new URL(request.url);
  if (request.init.method !== 'POST')
    throw new Error(
      'Use an Enrow single-contact preset with background polling.',
    );
  const input = validateEnrowRequest(
    url,
    request.init.body as string | undefined,
  );
  const { progress, index } = context;
  let saved = progress.state.requests[index];
  const now = Date.now();
  if (!saved) {
    // Save before the potentially billable POST. A lost response cannot safely
    // be retried: Enrow does not document an idempotency key or ID lookup API.
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
      throw new EnrowSubmissionUnknownError();
    }
    if (!response.ok) {
      await response.body?.cancel();
      if ([400, 401, 402, 429].includes(response.status)) {
        await progress.saveRequest(index, undefined);
        throw new Error(
          `Enrow HTTP ${response.status}; lookup rejected. Check inputs, API access, or credits before resuming.`,
        );
      }
      throw new EnrowSubmissionUnknownError();
    }
    let data: Record<string, unknown>;
    try {
      data = (await readJson(response)) as Record<string, unknown>;
    } catch {
      throw new EnrowSubmissionUnknownError();
    }
    if (
      !data ||
      typeof data.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(data.id)
    )
      throw new EnrowSubmissionUnknownError();
    await progress.saveRequest(index, {
      phase: 'waiting',
      requestId: data.id,
      submittedAt: now,
      nextPollAt: now + ENROW_POLL_INTERVAL_MS,
      pollCount: 0,
      waitUntil: now + ENROW_WAIT_WINDOW_MS,
    });
    const credits =
      typeof data.credits_used === 'number' &&
      Number.isFinite(data.credits_used) &&
      data.credits_used >= 0
        ? data.credits_used
        : null;
    throw new EnrowPendingError(
      `Waiting for Enrow. Search ID: ${data.id}. Pomade will check this saved search automatically.`,
      credits,
    );
  }
  if (saved.phase === 'submitting' || !saved.requestId)
    throw new EnrowSubmissionUnknownError();
  if (saved.waitUntil && now >= saved.waitUntil) {
    await progress.saveRequest(index, { ...saved, waitUntil: undefined });
    throw new Error(
      `Enrow is still processing after 30 minutes. Resume to keep checking search ${saved.requestId}; no new lookup will be submitted.`,
    );
  }
  if (now < saved.nextPollAt)
    throw new EnrowPendingError(
      `Waiting for Enrow. Search ID: ${saved.requestId}. Next status check is scheduled.`,
    );
  saved = {
    ...saved,
    pollCount: saved.pollCount + 1,
    nextPollAt:
      now + Math.min(60_000, ENROW_POLL_INTERVAL_MS * (saved.pollCount + 1)),
    waitUntil: saved.waitUntil ?? now + ENROW_WAIT_WINDOW_MS,
  };
  await progress.saveRequest(index, saved);
  url.searchParams.set('id', saved.requestId!);
  const response = await send(url.toString(), {
    ...request.init,
    method: 'GET',
    body: undefined,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Enrow HTTP ${response.status} while checking search ${saved.requestId}. Resume to check the same search again.`,
    );
  }
  const data = await readJson(response);
  // 202 means the request is still operating, even if a partial value is present.
  const result = response.status === 202 ? null : enrowResult(url, input, data);
  if (!result)
    throw new EnrowPendingError(
      `Waiting for Enrow. Search ID: ${saved.requestId}. Status checks so far: ${saved.pollCount}.`,
    );
  return result;
}
