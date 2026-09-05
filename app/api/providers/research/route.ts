import { env } from 'cloudflare:workers';

export async function GET() {
  const parallelConfigured = Boolean(env.PARALLEL_API_KEY?.trim());
  const geminiConfigured = Boolean(env.GEMINI_API_KEY?.trim());
  const provider = parallelConfigured
    ? 'parallel'
    : geminiConfigured
      ? 'gemini'
      : null;

  return Response.json({
    provider,
    configured: provider !== null,
    label:
      provider === 'parallel'
        ? 'Parallel Web Research'
        : provider === 'gemini'
          ? 'Gemini + Google Search'
          : 'AI web research',
    model:
      provider === 'parallel'
        ? env.PARALLEL_MODEL?.trim() || 'speed'
        : provider === 'gemini'
          ? env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash'
          : 'No provider configured',
    capabilities: {
      webResearch: true,
      citations: true,
      maximumActionsPerRun: 10,
    },
  });
}
