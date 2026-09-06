import { env } from 'cloudflare:workers';
import {
  researchConfiguration,
  createResearchClient,
} from '@/lib/research-provider';
import { CodexWebResearchClient } from '@/lib/codex-client';
import { HostedCodexWebResearchClient } from '@/lib/companion-research';
import { ensureDatabase } from '@/db/ensure';
export async function GET() {
  try {
    const status = researchConfiguration(env);
    let error: string | undefined;
    let ready = status.configured;
    if (status.provider === 'codex' && status.configured) {
      try {
        await ensureDatabase();
        const client = createResearchClient(env) as
          | CodexWebResearchClient
          | HostedCodexWebResearchClient;
        const connection = await client.status();
        status.configured = connection.configured;
        ready =
          'ready' in connection
            ? connection.ready === true
            : connection.configured;
        if (status.companion && !ready)
          error =
            'Your Mac is offline or research is not ready. Background runs will wait for it to reconnect.';
      } catch (e) {
        status.configured = false;
        error = e instanceof Error ? e.message : 'Codex helper is unavailable.';
      }
    }
    return Response.json({
      ...status,
      ready,
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
