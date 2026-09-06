import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/ensure';
import { readResearchDefaults } from '@/db/research-settings';
import {
  researchConfiguration,
  createResearchClient,
} from '@/lib/research-provider';
import { ResearchPendingError } from '@/lib/companion-research';
import {
  compileWorkbookPlan,
  parseWorkbookPlanAnswer,
  workbookPlanningPrompt,
} from '@/lib/workbook-planner';
import { sha256 } from '@/lib/deployment';
import { summarizeTable } from '@/lib/workbook';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      request?: string;
      plan?: unknown;
      creationId?: string;
    };
    if (
      typeof body.request !== 'string' ||
      !body.request.trim() ||
      body.request.length > 5000
    )
      throw new Error('Paste a request of 1–5,000 characters.');
    const db = await ensureDatabase();
    if (body.action === 'plan') {
      const planningEnvironment = {
        ...env,
        POMADE_RESEARCH_PROVIDER: 'codex',
        POMADE_CODEX_BROWSER: 'false',
      };
      const configuration = researchConfiguration(planningEnvironment);
      if (!configuration.configured)
        throw new Error(
          'Connect the local ChatGPT helper (or hosted Mac companion) to plan a workbook. Research columns can use your normal research provider.',
        );
      const defaults = await readResearchDefaults(db, planningEnvironment);
      const client = createResearchClient(
        planningEnvironment,
        defaults,
        'plan',
      );
      const prompt = workbookPlanningPrompt(body.request);
      const result = await client.research(prompt);
      const plan = parseWorkbookPlanAnswer(result.answer);
      const compiled = compileWorkbookPlan(
        plan,
        body.request,
        crypto.randomUUID(),
      );
      return Response.json({
        plan,
        tables: compiled.tables.map(summarizeTable),
        provider: configuration.label,
        model: result.model,
      });
    }
    if (body.action !== 'create' || typeof body.creationId !== 'string')
      throw new Error('Choose Plan or Create workbook.');
    const fingerprint = await sha256(JSON.stringify([body.request, body.plan]));
    const { tables } = compileWorkbookPlan(
      body.plan,
      body.request,
      body.creationId,
      fingerprint,
    );
    const prior = await Promise.all(
      tables.map((table) =>
        db
          .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
          .bind(table.id)
          .first<{ snapshot: string }>(),
      ),
    );
    if (prior.some(Boolean)) {
      if (
        !prior.every(
          (record) =>
            record &&
            (JSON.parse(record.snapshot) as WorkspaceSnapshot).workbookPlan
              ?.fingerprint === fingerprint,
        )
      )
        return Response.json(
          {
            error:
              'This creation ID belongs to a different workbook. Reopen the builder to create another.',
          },
          { status: 409 },
        );
      return Response.json({
        tables: prior.map((record) =>
          summarizeTable(JSON.parse(record!.snapshot)),
        ),
        reused: true,
      });
    }
    await db.batch(
      tables.map((table) =>
        db
          .prepare(
            'INSERT INTO workspaces (id, name, snapshot, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          )
          .bind(
            table.id,
            table.name,
            JSON.stringify(table),
            table.updatedAt,
            table.updatedAt,
          ),
      ),
    );
    return Response.json(
      { tables: tables.map(summarizeTable) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ResearchPendingError)
      return Response.json(
        {
          pending: true,
          message:
            'Your Mac is preparing the workbook plan. Keep the companion running.',
        },
        { status: 202 },
      );
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Workbook planning failed.',
      },
      { status: 400 },
    );
  }
}
