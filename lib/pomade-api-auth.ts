import { z } from 'zod';

export const apiScopes = ['read', 'run', 'crm:read', 'crm:write'] as const;
export type ApiScope = (typeof apiScopes)[number];
const keySchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  scopes: z.array(z.enum(apiScopes)).min(1),
});
export type PomadeApiKey = z.infer<typeof keySchema>;
export class PomadeApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function authenticatePomadeApi(
  request: Request,
  configured?: string,
) {
  // This first API release belongs to the trusted local app, which has no user accounts yet.
  const url = new URL(request.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new PomadeApiError(403, 'The Pomade API is currently local only.');
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin)
    throw new PomadeApiError(403, 'Cross-origin API requests are not allowed.');
  const parsed = z.array(keySchema).max(50).safeParse(parseKeys(configured));
  if (!parsed.success || !parsed.data.length)
    throw new PomadeApiError(
      503,
      'Generate a Pomade API key and restart the local server.',
    );
  const match = /^Bearer (pomade_[A-Za-z0-9_-]{40,160})$/.exec(
    request.headers.get('authorization') ?? '',
  );
  if (!match)
    throw new PomadeApiError(401, 'A valid Pomade bearer API key is required.');
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(match[1]),
  );
  const digest = Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  const key = parsed.data.find((k) => k.sha256 === digest);
  if (!key) throw new PomadeApiError(401, 'Invalid or revoked Pomade API key.');
  return key;
}
function parseKeys(value?: string): unknown {
  try {
    return JSON.parse(value ?? '[]');
  } catch {
    return null;
  }
}
export function apiErrorResponse(error: unknown) {
  const status = error instanceof PomadeApiError ? error.status : 500;
  return Response.json(
    {
      error:
        error instanceof PomadeApiError
          ? error.message
          : 'Pomade API operation failed.',
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(status === 401
          ? { 'WWW-Authenticate': 'Bearer realm="pomade"' }
          : {}),
      },
    },
  );
}
