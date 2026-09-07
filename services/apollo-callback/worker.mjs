// This service only acknowledges delivery. Pomade reads results through Apollo's
// authenticated API; unsolicited callbacks cannot change a workbook or CRM.
const MAX_BODY_BYTES = 1024 * 1024;
const service = 'pomade-apollo-callback';
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};
const json = (body, status = 200, extra = {}) =>
  Response.json(body, { status, headers: { ...headers, ...extra } });

async function digest(value) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function readPayload(request) {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_BODY_BYTES) return { status: 413 };
  if (!request.body) return { status: 400 };
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { status: 413 };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || Array.isArray(data) || typeof data !== 'object')
      return { status: 400 };
    return { status: 200 };
  } catch {
    return { status: 400 };
  } finally {
    reader.releaseLock();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET')
      return json({ service, mode: 'acknowledge-only' });
    // Use an independent random receipt token, never a Pomade or provider key.
    const token = /^\/apollo\/([A-Za-z0-9_-]{40,160})$/.exec(url.pathname)?.[1];
    if (!token || url.search) return json({ error: 'Not found.' }, 404);
    if (!/^[a-f0-9]{64}$/.test(env.POMADE_CALLBACK_TOKEN_SHA256 ?? ''))
      return json({ error: 'Callback is not configured.' }, 503);
    if ((await digest(token)) !== env.POMADE_CALLBACK_TOKEN_SHA256)
      return json({ error: 'Not found.' }, 404);
    if (request.method === 'GET')
      return json({ service, mode: 'acknowledge-only' });
    if (request.method !== 'POST')
      return json({ error: 'Use POST for delivery.' }, 405, {
        Allow: 'GET, POST',
      });
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() !== 'application/json'
    )
      return json({ error: 'Use application/json.' }, 415);
    const { status } = await readPayload(request);
    if (status !== 200)
      return json(
        {
          error:
            status === 413 ? 'Payload too large.' : 'Expected a JSON object.',
        },
        status,
      );
    // No database, outbound fetch, payload logging, or public result readback.
    return json({ service, received: true, mode: 'acknowledge-only' });
  },
};
