import {
  ProviderPendingError,
  ProviderResultError,
  ProviderSubmissionUnknownError,
  type AsyncProviderContext,
} from './async-provider';
import {
  validateDropcontactRequest,
  dropcontactObject,
  dropcontactResult,
} from './dropcontact';
const INTERVAL = 30_000;
const WINDOW = 30 * 60_000;
export async function executeDropcontactRequest(
  request: { url: string; init: RequestInit },
  context: AsyncProviderContext,
  send: (url: string, init: RequestInit) => Promise<Response>,
  readJson: (r: Response) => Promise<unknown>,
) {
  if (request.init.method !== 'POST')
    throw new Error('Use a Dropcontact preset in a background run.');
  const { input, contact } = validateDropcontactRequest(
    new URL(request.url),
    request.init.body as string,
  );
  const { progress, index } = context;
  let saved = progress.state.requests[index];
  const now = Date.now();
  if (!saved) {
    const correlationId = crypto.randomUUID();
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
          data: [
            { ...contact, custom_fields: { pomade_request: correlationId } },
          ],
        }),
      });
    } catch {
      throw new ProviderSubmissionUnknownError('Dropcontact');
    }
    if (!response.ok) {
      await response.body?.cancel();
      if ([400, 401, 402, 403, 429].includes(response.status)) {
        await progress.saveRequest(index, undefined);
        throw new Error(
          `Dropcontact HTTP ${response.status}; request rejected. Check inputs, access and credits.`,
        );
      }
      throw new ProviderSubmissionUnknownError('Dropcontact');
    }
    let data: Record<string, unknown> | undefined;
    try {
      data = dropcontactObject(await readJson(response));
    } catch {
      throw new ProviderSubmissionUnknownError('Dropcontact');
    }
    const id = data?.request_id;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id))
      throw new ProviderSubmissionUnknownError('Dropcontact');
    await progress.saveRequest(index, {
      phase: 'waiting',
      requestId: id,
      correlationId,
      submittedAt: now,
      nextPollAt: now + INTERVAL,
      pollCount: 0,
      waitUntil: now + WINDOW,
    });
    // credits_left is an account balance, not the cost of this request.
    if (
      data?.error ||
      data?.success !== true ||
      (Array.isArray(data.data) &&
        data.data.some(
          (c) =>
            Object.keys(dropcontactObject(dropcontactObject(c)?.errors) ?? {})
              .length,
        ))
    )
      throw new ProviderResultError(
        'Dropcontact reported input errors. The request ID is saved; review before resuming.',
        null,
      );
    throw new ProviderPendingError(
      `Waiting for Dropcontact request ${id}. Result checks are 30 seconds apart.`,
      null,
    );
  }
  if (saved.phase === 'submitting' || !saved.requestId || !saved.correlationId)
    throw new ProviderSubmissionUnknownError('Dropcontact');
  if (saved.waitUntil && now >= saved.waitUntil) {
    await progress.saveRequest(index, { ...saved, waitUntil: undefined });
    throw new ProviderResultError(
      'Dropcontact is still processing after 30 minutes. Resume to check the same request.',
      null,
    );
  }
  if (now < saved.nextPollAt)
    throw new ProviderPendingError(
      `Waiting for Dropcontact request ${saved.requestId}.`,
      null,
    );
  saved = {
    ...saved,
    pollCount: saved.pollCount + 1,
    nextPollAt: now + INTERVAL,
    waitUntil: saved.waitUntil ?? now + WINDOW,
  };
  await progress.saveRequest(index, saved);
  try {
    const response = await send(`${request.url}/${saved.requestId}`, {
      ...request.init,
      method: 'GET',
      body: undefined,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Dropcontact HTTP ${response.status} while reading the saved request.`,
      );
    }
    const data = dropcontactObject(await readJson(response));
    if (
      data?.error === false &&
      data.success === false &&
      typeof data.reason === 'string' &&
      data.reason.toLowerCase().startsWith('request not ready yet')
    )
      throw new ProviderPendingError(
        `Waiting for Dropcontact request ${saved.requestId}. Next check in 30 seconds.`,
        null,
      );
    if (!data || data.error !== false || data.success !== true)
      throw new Error('Dropcontact did not return a completed result.');
    const record =
      Array.isArray(data.data) && data.data.length === 1
        ? dropcontactObject(data.data[0])
        : undefined;
    if (
      !record ||
      dropcontactObject(record.custom_fields)?.pomade_request !==
        saved.correlationId
    )
      throw new Error(
        'Dropcontact returned no uniquely matching contact; results withheld.',
      );
    if (Object.keys(dropcontactObject(record.errors) ?? {}).length)
      throw new Error(
        'Dropcontact reported contact input errors; results withheld.',
      );
    return { data: dropcontactResult(record), credits: null };
  } catch (error) {
    if (error instanceof ProviderPendingError) throw error;
    throw new ProviderResultError(
      error instanceof Error
        ? error.message
        : 'Dropcontact result could not be read. Resume checks the saved request.',
      null,
    );
  }
}
