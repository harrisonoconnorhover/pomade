import { sha256 } from '@/lib/deployment';
import type { ActionReceipt } from '@/lib/pomade-types';
import type { EnrowRequest } from '@/lib/enrow';

type ProgressState = {
  attempts: Record<string, ActionReceipt>;
  requests: Record<string, EnrowRequest | undefined>;
};

// Scoped DB comes from the existing account environment. The job ID stays stable
// across restarts; a deliberately new run receives fresh progress.
export class WaterfallProgress {
  private constructor(
    private db: D1Database,
    private id: string,
    private raw: string,
  ) {}
  get state(): ProgressState {
    return JSON.parse(this.raw);
  }
  static async open(
    db: D1Database,
    input: {
      executionId: string;
      workspaceId: string;
      rowId: string;
      columnId: string;
      fingerprint: string;
    },
  ) {
    const id = await sha256(
      JSON.stringify([
        input.executionId,
        input.workspaceId,
        input.rowId,
        input.columnId,
      ]),
    );
    const fingerprint = await sha256(input.fingerprint);
    await db
      .prepare(`INSERT OR IGNORE INTO waterfall_progress
      (id, workspace_id, execution_id, fingerprint, state, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(
        id,
        input.workspaceId,
        input.executionId,
        fingerprint,
        JSON.stringify({ attempts: {}, requests: {} }),
        Date.now(),
      )
      .run();
    const record = await db
      .prepare('SELECT fingerprint, state FROM waterfall_progress WHERE id=?')
      .bind(id)
      .first<{ fingerprint: string; state: string }>();
    if (!record || record.fingerprint !== fingerprint)
      throw new Error(
        'Waterfall inputs or settings changed while this run was waiting. Start a new run for the changed inputs.',
      );
    return new WaterfallProgress(db, id, record.state);
  }
  private async save(state: ProgressState) {
    const next = JSON.stringify(state);
    const result = await this.db
      .prepare(
        'UPDATE waterfall_progress SET state=?, updated_at=? WHERE id=? AND state=?',
      )
      .bind(next, Date.now(), this.id, this.raw)
      .run();
    if (result.meta.changes !== 1)
      throw new Error(
        'Another worker advanced this waterfall. Resume the background run to reload its saved progress.',
      );
    this.raw = next;
  }
  async saveRequest(index: number, request: EnrowRequest | undefined) {
    const state = this.state;
    state.requests[index] = request;
    await this.save(state);
  }
  async saveAttempt(index: number, receipt: ActionReceipt) {
    const state = this.state;
    state.attempts[index] = receipt;
    await this.save(state);
  }
}
