import { HostedCodexWebResearchClient } from './companion-research';
import { CodexWebResearchClient } from './codex-client';
import { ParallelWebResearchClient } from './parallel-client';
import { GeminiWebResearchClient } from './gemini-client';
export type ResearchEnvironment = {
  DB?: D1Database;
  POMADE_DEPLOYMENT?: string;
  POMADE_COMPANION_TOKEN_SHA256?: string;
  POMADE_RESEARCH_PROVIDER?: string;
  POMADE_CODEX_URL?: string;
  POMADE_CODEX_TOKEN?: string;
  POMADE_CODEX_MODEL?: string;
  POMADE_CODEX_REASONING_EFFORT?: string;
  POMADE_CODEX_BROWSER?: string;
  PARALLEL_API_KEY?: string;
  PARALLEL_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
};
export function researchConfiguration(env: ResearchEnvironment) {
  const selected = env.POMADE_RESEARCH_PROVIDER?.trim();
  if (selected && !['codex', 'parallel', 'gemini'].includes(selected))
    throw new Error(
      'Choose codex, parallel or gemini for POMADE_RESEARCH_PROVIDER.',
    );
  const provider = (selected ||
    (env.PARALLEL_API_KEY?.trim() ? 'parallel' : 'gemini')) as
    | 'codex'
    | 'parallel'
    | 'gemini';
  const hosted = env.POMADE_DEPLOYMENT === 'hosted';
  const browser = provider === 'codex' && env.POMADE_CODEX_BROWSER === 'true';
  return {
    provider,
    browser,
    companion: hosted && provider === 'codex',
    configured: Boolean(
      provider === 'codex'
        ? hosted
          ? env.POMADE_COMPANION_TOKEN_SHA256?.trim()
          : env.POMADE_CODEX_TOKEN?.trim()
        : provider === 'parallel'
          ? env.PARALLEL_API_KEY?.trim()
          : env.GEMINI_API_KEY?.trim(),
    ),
    model:
      provider === 'codex'
        ? (env.POMADE_CODEX_MODEL?.trim() || 'Codex default') +
          (browser ? ' + local-browser-v1' : '')
        : provider === 'parallel'
          ? env.PARALLEL_MODEL?.trim() || 'speed'
          : env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
    label:
      provider === 'codex'
        ? browser
          ? 'Codex + local browser'
          : 'Codex · ChatGPT subscription'
        : provider === 'parallel'
          ? 'Parallel Web Research'
          : 'Gemini + Google Search',
  };
}
export function createResearchClient(
  env: ResearchEnvironment,
  settings?: import('./codex-models.mjs').CodexResearchSettings,
) {
  const { provider, model } = researchConfiguration(env);
  if (provider === 'codex' && env.POMADE_DEPLOYMENT === 'hosted') {
    if (!env.DB) throw new Error('Hosted research storage is unavailable.');
    return new HostedCodexWebResearchClient(env.DB, {
      model: settings?.model ?? env.POMADE_CODEX_MODEL?.trim(),
      reasoningEffort:
        settings?.reasoningEffort ?? env.POMADE_CODEX_REASONING_EFFORT?.trim(),
      browser: env.POMADE_CODEX_BROWSER === 'true',
    });
  }
  if (provider === 'codex')
    return new CodexWebResearchClient({
      url: env.POMADE_CODEX_URL,
      token: env.POMADE_CODEX_TOKEN,
      browser: env.POMADE_CODEX_BROWSER === 'true',
      model: settings?.model ?? env.POMADE_CODEX_MODEL?.trim(),
      reasoningEffort:
        settings?.reasoningEffort ?? env.POMADE_CODEX_REASONING_EFFORT?.trim(),
    });
  if (provider === 'parallel')
    return new ParallelWebResearchClient({
      apiKey: env.PARALLEL_API_KEY || '',
      model,
    });
  return new GeminiWebResearchClient({
    apiKey: env.GEMINI_API_KEY || '',
    model,
  });
}
