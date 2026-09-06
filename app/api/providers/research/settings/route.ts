import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/ensure';
import {
  readResearchDefaults,
  readResearchModels,
} from '@/db/research-settings';
import {
  resolveCodexSettings,
  validateCodexSettings,
} from '@/lib/codex-models.mjs';
import { researchConfiguration } from '@/lib/research-provider';

export async function GET(request: Request) {
  const db = await ensureDatabase();
  const defaults = await readResearchDefaults(db, env);
  try {
    if (researchConfiguration(env).provider !== 'codex')
      return Response.json({ defaults, models: [], updatedAt: 0 });
    const catalog = await readResearchModels(
      env,
      new URL(request.url).searchParams.get('refresh') === 'true',
    );
    return Response.json({
      defaults,
      ...catalog,
      ...(!catalog.models.length
        ? {
            error:
              'Start the updated research companion on your Mac to load your account models.',
          }
        : {}),
    });
  } catch (error) {
    return Response.json({
      defaults,
      models: [],
      updatedAt: 0,
      error:
        error instanceof Error
          ? error.message
          : 'The model list could not be loaded.',
    });
  }
}

export async function PUT(request: Request) {
  try {
    const db = await ensureDatabase();
    const defaults = validateCodexSettings(
      ((await request.json()) as { defaults?: unknown }).defaults,
    );
    const catalog = await readResearchModels(env);
    resolveCodexSettings(catalog.models, defaults);
    await db
      .prepare(
        'INSERT INTO research_settings (id, settings) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET settings = excluded.settings',
      )
      .bind(JSON.stringify(defaults))
      .run();
    return Response.json({ defaults, ...catalog });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Research defaults could not be saved.',
      },
      { status: 400 },
    );
  }
}
