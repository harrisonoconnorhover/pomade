import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/ensure';
import { createSampleWorkspace } from '@/lib/sample-workspace';
import {
  createTable,
  DEFAULT_TABLE_ID,
  isTableId,
  summarizeTable,
} from '@/lib/workbook';
import { createCsvWorkspace } from '@/lib/csv-import';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';

export async function GET() {
  const db = await ensureDatabase();
  const sample =
    env.POMADE_ACCOUNT_ID && env.POMADE_ACCOUNT_ID !== 'owner'
      ? createTable({
          id: DEFAULT_TABLE_ID,
          name: 'My first table',
          mode: 'empty',
        })
      : createSampleWorkspace();
  await db
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, snapshot, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(
      DEFAULT_TABLE_ID,
      sample.name,
      JSON.stringify(sample),
      sample.updatedAt,
      sample.updatedAt,
    )
    .run();
  const result = await db
    .prepare('SELECT snapshot FROM workspaces ORDER BY created_at, id')
    .all<{ snapshot: string }>();
  return Response.json({
    tables: result.results.map((record) =>
      summarizeTable(JSON.parse(record.snapshot)),
    ),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: unknown;
      mode?: unknown;
      sourceId?: unknown;
      rowIds?: unknown;
      csv?: unknown;
      filename?: unknown;
    };
    if (
      typeof body.name !== 'string' ||
      !['empty', 'duplicate', 'linked', 'csv'].includes(String(body.mode))
    )
      return Response.json(
        { error: 'Choose a table name and creation mode.' },
        { status: 400 },
      );
    const mode = body.mode as 'empty' | 'duplicate' | 'linked' | 'csv';
    if (
      mode === 'csv' &&
      (typeof body.csv !== 'string' || typeof body.filename !== 'string')
    )
      return Response.json(
        { error: 'Choose a CSV file to import.' },
        { status: 400 },
      );
    const db = await ensureDatabase();
    let source: WorkspaceSnapshot | undefined;
    if (mode !== 'empty' && mode !== 'csv') {
      if (!isTableId(body.sourceId))
        return Response.json(
          { error: 'Choose a source table.' },
          { status: 400 },
        );
      const record = await db
        .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
        .bind(body.sourceId)
        .first<{ snapshot: string }>();
      if (!record)
        return Response.json(
          { error: 'Source table not found.' },
          { status: 404 },
        );
      source = JSON.parse(record.snapshot);
    }
    if (
      mode === 'linked' &&
      (!Array.isArray(body.rowIds) ||
        body.rowIds.some((id) => typeof id !== 'string'))
    )
      return Response.json({ error: 'Choose source rows.' }, { status: 400 });
    const workspace =
      mode === 'csv'
        ? createCsvWorkspace(
            body.csv as string,
            body.name,
            crypto.randomUUID(),
            (body.filename as string).slice(0, 255),
          )
        : createTable({
            id: crypto.randomUUID(),
            name: body.name,
            mode,
            source,
            rowIds: body.rowIds as string[] | undefined,
          });
    await db
      .prepare(`INSERT INTO workspaces (id, name, snapshot, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(
        workspace.id,
        workspace.name,
        JSON.stringify(workspace),
        workspace.updatedAt,
        workspace.updatedAt,
      )
      .run();
    return Response.json({ table: summarizeTable(workspace) }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Table creation failed.',
      },
      { status: 400 },
    );
  }
}
