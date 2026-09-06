export type DeploymentEnvironment = {
  POMADE_DEPLOYMENT?: string;
  POMADE_OWNER_EMAIL?: string;
  POMADE_OWNER_TOKEN_SHA256?: string;
  POMADE_PUBLIC_ORIGIN?: string;
  POMADE_SCHEDULES_ENABLED?: string;
  POMADE_COMPANION_TOKEN_SHA256?: string;
};

export function deploymentStatus(env: DeploymentEnvironment) {
  const hosted = env.POMADE_DEPLOYMENT === 'hosted';
  return {
    hosted,
    label: hosted ? 'Hosted' : 'Local',
    schedulesEnabled:
      env.POMADE_SCHEDULES_ENABLED === 'true' ||
      (!hosted && env.POMADE_SCHEDULES_ENABLED !== 'false'),
  };
}

export async function sha256(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

// Sites authenticates the visitor before forwarding identity headers. The
// owner check also fails closed if this Worker is deployed without that gate.
export async function authorizeDeployment(
  request: Request,
  env: DeploymentEnvironment,
) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const reject = (error: string, status: number) =>
    Response.json(
      { error },
      {
        status,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  if (env.POMADE_DEPLOYMENT !== 'hosted') {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      return reject('This Pomade instance is local only.', 403);
    if (origin && origin !== url.origin)
      return reject('Cross-origin requests are not allowed.', 403);
    return null;
  }
  if (url.pathname === '/api/companion') {
    const token = /^Bearer ([A-Za-z0-9_-]{40,160})$/.exec(
      request.headers.get('authorization') ?? '',
    )?.[1];
    if (
      origin ||
      !token ||
      !env.POMADE_COMPANION_TOKEN_SHA256 ||
      (await sha256(token)) !== env.POMADE_COMPANION_TOKEN_SHA256
    )
      return reject('Invalid companion connection.', 401);
    return null;
  }
  if (!env.POMADE_OWNER_EMAIL || !env.POMADE_PUBLIC_ORIGIN)
    return reject('Hosted access is not configured.', 503);
  const email = request.headers
    .get('oai-authenticated-user-email')
    ?.trim()
    .toLowerCase();
  const ownerToken = request.headers.get('x-pomade-owner-key');
  const ownerAutomation =
    !!ownerToken &&
    /^[A-Za-z0-9_-]{40,160}$/.test(ownerToken) &&
    !!env.POMADE_OWNER_TOKEN_SHA256 &&
    (await sha256(ownerToken)) === env.POMADE_OWNER_TOKEN_SHA256;
  if (
    !ownerAutomation &&
    (!email || email !== env.POMADE_OWNER_EMAIL.trim().toLowerCase())
  )
    return reject('Sign in with the account that owns this Pomade site.', 401);
  if (origin && origin !== env.POMADE_PUBLIC_ORIGIN)
    return reject('Cross-origin requests are not allowed.', 403);
  return null;
}
