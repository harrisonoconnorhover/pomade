import type {
  CodexModel,
  CodexResearchSettings,
} from '../lib/codex-models.mjs';
import {
  validateCodexSettings,
  validCodexModels,
} from '../lib/codex-models.mjs';
import { CodexWebResearchClient } from '../lib/codex-client';
import type { ResearchEnvironment } from '../lib/research-provider';

export async function readResearchDefaults(
  db: D1Database,
  env: ResearchEnvironment,
): Promise<CodexResearchSettings> {
  const row = await db
    .prepare('SELECT settings FROM research_settings WHERE id = 1')
    .first<{ settings: string }>();
  return validateCodexSettings(
    row
      ? JSON.parse(row.settings)
      : {
          model: env.POMADE_CODEX_MODEL?.trim() || undefined,
          reasoningEffort:
            env.POMADE_CODEX_REASONING_EFFORT?.trim() || undefined,
        },
  );
}

export async function readResearchModels(
  env: ResearchEnvironment,
  refresh = false,
): Promise<{ models: CodexModel[]; updatedAt: number }> {
  if (env.POMADE_DEPLOYMENT === 'hosted') {
    const row = await env
      .DB!.prepare(
        'SELECT models, models_updated_at FROM research_companion WHERE id = 1',
      )
      .first<{ models: string | null; models_updated_at: number | null }>();
    const models = row?.models ? JSON.parse(row.models) : [];
    return {
      models: validCodexModels(models) ? models : [],
      updatedAt: row?.models_updated_at ?? 0,
    };
  }
  return new CodexWebResearchClient({
    url: env.POMADE_CODEX_URL,
    token: env.POMADE_CODEX_TOKEN,
  }).models(refresh);
}
