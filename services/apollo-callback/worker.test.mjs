import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from './worker.mjs';
const MAX_BODY_BYTES = 1024 * 1024;
const token = 'synthetic-receipt-token-123456789012345678901234567890';
const env = {
  POMADE_CALLBACK_TOKEN_SHA256: createHash('sha256')
    .update(token)
    .digest('hex'),
};
const endpoint = 'https://callback.example.test/apollo/' + token;
const post = (body, extra = {}) =>
  new Request(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    ...extra,
  });

test('public health has no authentication and no contact readback', async () => {
  const health = await worker.fetch(
    new Request('https://callback.example.test/health'),
    env,
  );
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, 'pomade-apollo-callback');
  for (const path of ['/', '/api/workspaces', '/apollo', '/results']) {
    assert.equal(
      (
        await worker.fetch(
          new Request('https://callback.example.test' + path),
          env,
        )
      ).status,
      404,
    );
  }
});
test('acknowledges a phone callback and duplicates without persisting, echoing or forwarding', async () => {
  const body = JSON.stringify({
    status: 'success',
    people: [
      {
        id: 'synthetic-person',
        phone_numbers: [{ sanitized_number: '+12025550123' }],
      },
    ],
  });
  for (let i = 0; i < 2; i++) {
    const response = await worker.fetch(post(body), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      service: 'pomade-apollo-callback',
      received: true,
      mode: 'acknowledge-only',
    });
  }
  const readback = await worker.fetch(new Request(endpoint), env);
  assert.deepEqual(await readback.json(), {
    service: 'pomade-apollo-callback',
    mode: 'acknowledge-only',
  });
});
test('requires the independent receipt token and fails closed without configuration', async () => {
  assert.equal((await worker.fetch(post('{}'), {})).status, 503);
  assert.equal(
    (await worker.fetch(new Request(endpoint + 'wrong'), env)).status,
    404,
  );
  assert.equal(
    (await worker.fetch(new Request(endpoint + '?leak=no'), env)).status,
    404,
  );
  assert.equal(
    (await worker.fetch(new Request(endpoint, { method: 'DELETE' }), env))
      .status,
    405,
  );
});
test('bounds JSON input including chunked requests without Content-Length', async () => {
  for (const body of ['', 'invalid', 'null', '[]'])
    assert.equal((await worker.fetch(post(body), env)).status, 400);
  assert.equal(
    (
      await worker.fetch(
        post('{}', { headers: { 'content-type': 'text/plain' } }),
        env,
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await worker.fetch(
        post('{}', {
          headers: {
            'content-type': 'application/json',
            'content-length': String(MAX_BODY_BYTES + 1),
          },
        }),
        env,
      )
    ).status,
    413,
  );
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(256 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  assert.equal(
    (await worker.fetch(post(body, { duplex: 'half' }), env)).status,
    413,
  );
  assert.equal(cancelled, true);
});
