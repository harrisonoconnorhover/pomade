import { env } from 'cloudflare:workers';
import {
  authenticatePomadeApi,
  apiErrorResponse,
  PomadeApiError,
} from '@/lib/pomade-api-auth';
import { callPomadeTool } from '@/lib/pomade-api';
import { pomadeApiBackend } from '@/db/pomade-api-backend';

export async function POST(
  request: Request,
  context: { params: Promise<{ tool: string }> },
) {
  try {
    const key = await authenticatePomadeApi(request, env.POMADE_API_KEYS);
    // Tool inputs contain IDs and filters, never a full replacement workspace.
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 32_768)
      throw new PomadeApiError(413, 'Tool arguments are too large.');
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      throw new PomadeApiError(400, 'Expected JSON arguments.');
    }
    const { tool } = await context.params;
    const result = await callPomadeTool(
      tool,
      input,
      key,
      await pomadeApiBackend(),
    );
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
