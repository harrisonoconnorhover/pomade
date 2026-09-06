import { describe, expect, it } from 'vitest';
import { authorizeDeployment, deploymentStatus, sha256 } from './deployment';

describe('local and hosted access', () => {
  const hosted = {
    POMADE_DEPLOYMENT: 'hosted',
    POMADE_OWNER_EMAIL: 'owner@example.com',
    POMADE_PUBLIC_ORIGIN: 'https://pomade.example.com',
  };
  it('keeps local operation on loopback and rejects foreign browser origins', async () => {
    expect(
      await authorizeDeployment(
        new Request('http://localhost:8798/api/tables'),
        {},
      ),
    ).toBeNull();
    expect(
      (
        await authorizeDeployment(
          new Request('https://public.example/api/tables'),
          {},
        )
      )?.status,
    ).toBe(403);
    expect(
      (
        await authorizeDeployment(
          new Request('http://localhost:8798/api/workspace', {
            headers: { origin: 'https://foreign.example' },
          }),
          {},
        )
      )?.status,
    ).toBe(403);
  });
  it('requires the configured owner for pages and APIs on the hosted copy', async () => {
    for (const path of ['/', '/api/tables', '/api/crm-sync']) {
      expect(
        (
          await authorizeDeployment(
            new Request(hosted.POMADE_PUBLIC_ORIGIN + path),
            hosted,
          )
        )?.status,
      ).toBe(401);
      expect(
        (
          await authorizeDeployment(
            new Request(hosted.POMADE_PUBLIC_ORIGIN + path, {
              headers: { 'oai-authenticated-user-email': 'other@example.com' },
            }),
            hosted,
          )
        )?.status,
      ).toBe(401);
      expect(
        await authorizeDeployment(
          new Request(hosted.POMADE_PUBLIC_ORIGIN + path, {
            headers: { 'oai-authenticated-user-email': 'owner@example.com' },
          }),
          hosted,
        ),
      ).toBeNull();
    }
    expect(
      (
        await authorizeDeployment(new Request(hosted.POMADE_PUBLIC_ORIGIN), {
          POMADE_DEPLOYMENT: 'hosted',
        })
      )?.status,
    ).toBe(503);
  });
  it('restricts the Mac token to the companion endpoint and rejects browser requests', async () => {
    const token = 't'.repeat(64),
      env = { ...hosted, POMADE_COMPANION_TOKEN_SHA256: await sha256(token) };
    const headers = { Authorization: `Bearer ${token}` };
    expect(
      await authorizeDeployment(
        new Request(hosted.POMADE_PUBLIC_ORIGIN + '/api/companion', {
          headers,
        }),
        env,
      ),
    ).toBeNull();
    expect(
      (
        await authorizeDeployment(
          new Request(hosted.POMADE_PUBLIC_ORIGIN + '/api/workspace', {
            headers,
          }),
          env,
        )
      )?.status,
    ).toBe(401);
    expect(
      (
        await authorizeDeployment(
          new Request(hosted.POMADE_PUBLIC_ORIGIN + '/api/companion', {
            headers: { ...headers, origin: hosted.POMADE_PUBLIC_ORIGIN },
          }),
          env,
        )
      )?.status,
    ).toBe(401);
  });
  it('keeps schedules enabled locally and paused by default on the hosted copy', () => {
    expect(deploymentStatus({}).schedulesEnabled).toBe(true);
    expect(deploymentStatus(hosted).schedulesEnabled).toBe(false);
  });
});

it('requires a separate owner key for identity-less data-copy requests, and still checks browser origins', async () => {
  const token = 'o'.repeat(64);
  const env = {
    POMADE_DEPLOYMENT: 'hosted',
    POMADE_OWNER_EMAIL: 'owner@example.com',
    POMADE_PUBLIC_ORIGIN: 'https://pomade.example.com',
    POMADE_OWNER_TOKEN_SHA256: await sha256(token),
  };
  const request = (headers: Record<string, string>) =>
    new Request('https://pomade.example.com/api/tables', { headers });
  expect(
    await authorizeDeployment(request({ 'x-pomade-owner-key': token }), env),
  ).toBeNull();
  expect(
    (await authorizeDeployment(request({ 'x-pomade-owner-key': 'bad' }), env))
      ?.status,
  ).toBe(401);
  expect(
    (
      await authorizeDeployment(
        request({
          'x-pomade-owner-key': token,
          origin: 'https://foreign.example',
        }),
        env,
      )
    )?.status,
  ).toBe(403);
});
