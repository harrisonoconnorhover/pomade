import { CodexWebResearchClient } from './codex-client';
import { ParallelWebResearchClient } from './parallel-client';
import { GeminiWebResearchClient } from './gemini-client';
export type ResearchEnvironment = {
  POMADE_RESEARCH_PROVIDER?: string;
  POMADE_CODEX_URL?: string;
  POMADE_CODEX_TOKEN?: string;
  POMADE_CODEX_MODEL?: string;
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
  return {
    provider,
    configured: Boolean(
      provider === 'codex'
        ? env.POMADE_CODEX_TOKEN?.trim()
        : provider === 'parallel'
          ? env.PARALLEL_API_KEY?.trim()
          : env.GEMINI_API_KEY?.trim(),
    ),
    model:
      provider === 'codex'
        ? env.POMADE_CODEX_MODEL?.trim() || 'Codex default'
        : provider === 'parallel'
          ? env.PARALLEL_MODEL?.trim() || 'speed'
          : env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
    label:
      provider === 'codex'
        ? 'Codex · ChatGPT subscription'
        : provider === 'parallel'
          ? 'Parallel Web Research'
          : 'Gemini + Google Search',
  };
}
export function createResearchClient(env: ResearchEnvironment) {
  const { provider, model } = researchConfiguration(env);
  if (provider === 'codex')
    return new CodexWebResearchClient({
      url: env.POMADE_CODEX_URL,
      token: env.POMADE_CODEX_TOKEN,
      model: env.POMADE_CODEX_MODEL?.trim(),
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
