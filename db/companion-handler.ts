import { validCodexModels } from '../lib/codex-models.mjs';
import {
  claimCompanionRequest,
  finishCompanionRequest,
} from '../lib/companion-research';

export async function handleCompanion(request: Request, db: D1Database) {
  if (request.method !== 'POST')
    return Response.json({ error: 'Use POST.' }, { status: 405 });
  // Prompt and browser evidence can be sizeable, but never unbounded.
  const text = await request.text();
  if (text.length > 500_000)
    return Response.json({ error: 'Result too large.' }, { status: 413 });
  try {
    const body = JSON.parse(text);
    if (body.action === 'poll') {
      await db
        .prepare(`INSERT INTO research_companion (id, ready, browser_available, updated_at) VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET ready = excluded.ready, browser_available = excluded.browser_available, updated_at = excluded.updated_at`)
        .bind(
          body.ready === true ? 1 : 0,
          body.browserAvailable === true ? 1 : 0,
          Date.now(),
        )
        .run();
      if (validCodexModels(body.models)) {
        await db
          .prepare(
            'UPDATE research_companion SET models = ?, models_updated_at = ? WHERE id = 1',
          )
          .bind(
            JSON.stringify(body.models),
            typeof body.modelsUpdatedAt === 'number'
              ? body.modelsUpdatedAt
              : Date.now(),
          )
          .run();
      }
      const job =
        body.ready === true &&
        body.claim === true &&
        body.researchSettingsVersion === 1
          ? await claimCompanionRequest(
              db,
              Date.now(),
              body.planningVersion === 1,
            )
          : null;
      return Response.json({ job });
    }
    if (
      body.action === 'finish' &&
      typeof body.id === 'string' &&
      typeof body.leaseToken === 'string'
    ) {
      const accepted = await finishCompanionRequest(db, {
        id: body.id,
        leaseToken: body.leaseToken,
        result: body.result,
        error: typeof body.error === 'string' ? body.error : undefined,
        retry: body.retry === true,
      });
      return Response.json({ accepted }, { status: accepted ? 200 : 409 });
    }
    return Response.json(
      { error: 'Invalid companion action.' },
      { status: 400 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Invalid companion request.',
      },
      { status: 400 },
    );
  }
}
