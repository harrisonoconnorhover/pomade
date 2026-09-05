import { env } from 'cloudflare:workers';
import {
  researchConfiguration,
  createResearchClient,
} from '@/lib/research-provider';
import { CodexWebResearchClient } from '@/lib/codex-client';
export async function GET() {
  try {
    const status = researchConfiguration(env);
    let error: string | undefined;
    if (status.provider === 'codex' && status.configured) {
      try {
        const client = createResearchClient(env) as CodexWebResearchClient;
        status.configured = (await client.status()).configured;
      } catch (e) {
        status.configured = false;
        error = e instanceof Error ? e.message : 'Codex helper is unavailable.';
      }
    }
    return Response.json({
      ...status,
      error,
      capabilities: {
        webResearch: true,
        citations: true,
        maximumActionsPerRun: 10,
        localBrowser: status.browser,
        maximumPagesPerResearch: status.browser ? 6 : null,
      },
    });
  } catch (e) {
    return Response.json({
      provider: null,
      configured: false,
      label: 'AI web research',
      model: 'Setup needed',
      error: e instanceof Error ? e.message : 'Invalid research settings.',
      capabilities: {
        webResearch: true,
        citations: true,
        maximumActionsPerRun: 10,
      },
    });
  }
}
