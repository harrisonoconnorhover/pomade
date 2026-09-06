import { codexCacheIdentity } from './codex-models.mjs';
import type { WebResearchResult } from './pomade-types';
import { sha256 } from './deployment';

export const COMPANION_LEASE_MS = 6 * 60_000;
export const COMPANION_ONLINE_MS = 45_000;
export class ResearchPendingError extends Error {
  constructor() {
    super(
      'Waiting for research on your Mac. This background run will continue automatically.',
    );
  }
}

export type CompanionRequest = {
  id: string;
  prompt: string;
  purpose: 'research' | 'plan';
  model: string | null;
  reasoning_effort: string | null;
  browser: number;
  lease_token: string;
};

export async function companionStatus(db: D1Database, now = Date.now()) {
  const row = await db
    .prepare(
      'SELECT ready, browser_available, updated_at FROM research_companion WHERE id = 1',
    )
    .first<{ ready: number; browser_available: number; updated_at: number }>();
  return {
    online: !!row && row.updated_at > now - COMPANION_ONLINE_MS,
    ready:
      !!row && row.ready === 1 && row.updated_at > now - COMPANION_ONLINE_MS,
    browserAvailable: row?.browser_available === 1,
  };
}

export async function claimCompanionRequest(
  db: D1Database,
  now = Date.now(),
  planningAvailable = false,
) {
  const lease = crypto.randomUUID();
  return db
    .prepare(`UPDATE research_requests SET status = 'running', lease_token = ?, lease_until = ?, updated_at = ?
    WHERE id = (SELECT id FROM research_requests WHERE (status = 'queued' OR (status = 'running' AND lease_until <= ?)) AND (purpose = 'research' OR ? = 1)
    ORDER BY created_at LIMIT 1)
    RETURNING id, prompt, purpose, model, reasoning_effort, browser, lease_token`)
    .bind(lease, now + COMPANION_LEASE_MS, now, now, planningAvailable ? 1 : 0)
    .first<CompanionRequest>();
}

export function validResearchResult(
  value: unknown,
): value is WebResearchResult {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<WebResearchResult>;
  return (
    typeof r.answer === 'string' &&
    r.answer.length <= 100_000 &&
    Array.isArray(r.citations) &&
    r.citations.length <= 100 &&
    r.citations.every(
      (c) =>
        typeof c.title === 'string' &&
        typeof c.url === 'string' &&
        /^https?:\/\//.test(c.url),
    ) &&
    Array.isArray(r.queries) &&
    r.queries.every((q) => typeof q === 'string')
  );
}

export async function finishCompanionRequest(
  db: D1Database,
  input: {
    id: string;
    leaseToken: string;
    result?: unknown;
    error?: string;
    retry?: boolean;
  },
  now = Date.now(),
) {
  if (!input.error && !validResearchResult(input.result))
    throw new Error('Invalid research result.');
  const status = input.retry ? 'queued' : input.error ? 'failed' : 'completed';
  const result = await db
    .prepare(`UPDATE research_requests SET status = ?, result = ?, error = ?, lease_until = NULL, updated_at = ?
    WHERE id = ? AND lease_token = ? AND status = 'running'`)
    .bind(
      status,
      input.error ? null : JSON.stringify(input.result),
      input.error?.slice(0, 500) ?? null,
      now,
      input.id,
      input.leaseToken,
    )
    .run();
  if (result.meta.changes === 1) return true;
  // A lost HTTP response must not cause the Mac to run the same research again.
  const prior = await db
    .prepare('SELECT status, lease_token FROM research_requests WHERE id = ?')
    .bind(input.id)
    .first<{ status: string; lease_token: string }>();
  return prior?.status === status && prior.lease_token === input.leaseToken;
}

export class HostedCodexWebResearchClient {
  constructor(
    private db: D1Database,
    private options: {
      model?: string;
      browser?: boolean;
      purpose?: 'research' | 'plan';
      reasoningEffort?: string;
    },
  ) {}
  async status() {
    const status = await companionStatus(this.db);
    return {
      configured: true,
      ...status,
      ready: status.ready && (!this.options.browser || status.browserAvailable),
    };
  }
  async research(prompt: string): Promise<WebResearchResult> {
    if (prompt.length > 30_000)
      throw new Error('Use a shorter research prompt.');
    const id = await sha256(
      JSON.stringify([
        codexCacheIdentity(this.options, !!this.options.browser),
        this.options.purpose === 'plan' ? `workbook-plan-v1:${prompt}` : prompt,
      ]),
    );
    const now = Date.now();
    // A successful result is reused for one day, like the normal research cache.
    await this.db
      .prepare(
        `DELETE FROM research_requests WHERE id = ? AND status IN ('completed', 'failed') AND updated_at < ?`,
      )
      .bind(id, now - 86_400_000)
      .run();
    await this.db
      .prepare(`INSERT OR IGNORE INTO research_requests
      (id, prompt, purpose, model, reasoning_effort, browser, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`)
      .bind(
        id,
        prompt,
        this.options.purpose ?? 'research',
        this.options.model || null,
        this.options.reasoningEffort || null,
        this.options.browser ? 1 : 0,
        now,
        now,
      )
      .run();
    const row = await this.db
      .prepare(
        'SELECT status, result, error FROM research_requests WHERE id = ?',
      )
      .bind(id)
      .first<{ status: string; result: string | null; error: string | null }>();
    if (row?.status === 'completed' && row.result)
      return JSON.parse(row.result) as WebResearchResult;
    if (row?.status === 'failed') {
      await this.db
        .prepare(
          "DELETE FROM research_requests WHERE id = ? AND status = 'failed'",
        )
        .bind(id)
        .run();
      throw new Error(
        row.error ||
          'Research on your Mac failed. Resume the background run to retry.',
      );
    }
    throw new ResearchPendingError();
  }
}
