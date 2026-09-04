import { env } from 'cloudflare:workers';

export async function GET() {
  return Response.json({
    provider: 'gemini',
    configured: Boolean(env.GEMINI_API_KEY?.trim()),
    model: env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
    capabilities: {
      webResearch: true,
      googleSearch: true,
      citations: true,
      maximumActionsPerRun: 10,
    },
  });
}
