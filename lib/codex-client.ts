import {
  CodexSettingsError,
  validCodexModels,
  type CodexModel,
} from './codex-models.mjs';
import type { WebResearchResult } from './pomade-types';

export class CodexWebResearchClient {
  private origin: string;
  constructor(
    private options: {
      url?: string;
      token?: string;
      model?: string;
      reasoningEffort?: string;
      browser?: boolean;
      fetchImpl?: typeof fetch;
    },
  ) {
    const url = new URL(options.url || 'http://127.0.0.1:9876');
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error(
        'Codex research needs the local helper at http://127.0.0.1:<port>.',
      );
    this.origin = url.origin;
  }
  private async request(path: string, body?: unknown) {
    if (!this.options.token?.trim())
      throw new Error(
        'Configure POMADE_CODEX_TOKEN and start npm run research:codex.',
      );
    let response: Response;
    try {
      response = await (this.options.fetchImpl ?? fetch)(this.origin + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'manual',
        signal: AbortSignal.timeout(
          body ? (this.options.browser ? 260_000 : 200_000) : 15_000,
        ),
      });
    } catch {
      throw new Error(
        'The local Codex helper is unavailable or timed out. Start npm run research:codex.',
      );
    }
    if (!response.ok) {
      const details = (await response.json().catch(() => null)) as {
        code?: string;
        error?: string;
      } | null;
      const setupErrors: Record<string, string> = {
        browser_unavailable:
          'Install local Chromium with npm run research:browser:install, then check the connection again.',
        chatgpt_login_required:
          'Sign in to Codex with your ChatGPT account on this Mac, then check the connection again.',
        codex_unavailable:
          'The local helper could not start Codex. Check POMADE_CODEX_BIN and restart npm run research:codex.',
      };
      const messages: Record<number, string> = {
        401: 'The local Codex connection token does not match.',
        429: 'Codex research is already running. Try this row again after it finishes.',
        503: 'The local research helper is not ready. Check its terminal, local browser installation and ChatGPT login, then check the connection again.',
        504: 'Codex research timed out. Try a narrower question.',
      };
      if (details?.code === 'invalid_research_settings')
        throw new CodexSettingsError(
          details.error || 'Choose a supported model and reasoning effort.',
        );
      if (details?.code === 'models_unavailable')
        throw new Error(
          'The Codex model list is unavailable. Restart the helper and refresh models.',
        );
      throw new Error(
        (response.status === 503 &&
          details?.code &&
          setupErrors[details.code]) ||
          messages[response.status] ||
          'Codex research failed. Check the local helper terminal and your subscription usage.',
      );
    }
    return response.json();
  }
  async status(): Promise<{ configured: boolean }> {
    const data = (await this.request('/status')) as {
      configured?: unknown;
      browserAvailable?: unknown;
    } | null;
    if (data?.configured !== true)
      throw new Error(
        'Sign in to Codex with your ChatGPT account on this Mac, then check the connection again.',
      );
    if (this.options.browser && data.browserAvailable !== true)
      throw new Error(
        'Install local Chromium with npm run research:browser:install, then restart the Codex helper.',
      );
    return { configured: true };
  }
  async models(
    refresh = false,
  ): Promise<{ models: CodexModel[]; updatedAt: number }> {
    const catalog = (await this.request(
      refresh ? '/models?refresh=true' : '/models',
    )) as { models?: unknown; updatedAt: number };
    if (!validCodexModels(catalog?.models))
      throw new Error(
        'Update the local research helper to load its model list.',
      );
    return { models: catalog.models, updatedAt: catalog.updatedAt };
  }
  async research(prompt: string): Promise<WebResearchResult> {
    const raw = await this.request('/research', {
      prompt,
      model: this.options.model,
      reasoningEffort: this.options.reasoningEffort,
      browser: this.options.browser,
    });
    const data = raw as Partial<WebResearchResult> | null;
    if (
      !data ||
      typeof data.answer !== 'string' ||
      !Array.isArray(data.citations) ||
      !Array.isArray(data.queries)
    )
      throw new Error(
        'The local Codex helper returned an invalid research result.',
      );
    return {
      answer: data.answer,
      citations: data.citations.filter(
        (c: { url?: unknown; title?: unknown }) =>
          typeof c.url === 'string' &&
          /^https?:\/\//i.test(c.url) &&
          typeof c.title === 'string',
      ),
      queries: data.queries.filter((q: unknown) => typeof q === 'string'),
      model: typeof data.model === 'string' ? data.model : 'Not reported',
      reasoningEffort: data.reasoningEffort,
      ...(this.options.browser && Array.isArray(data.browserVisits)
        ? { browserVisits: data.browserVisits }
        : {}),
      cached: false,
    };
  }
}
