import { ensureDatabase } from '@/db/ensure';
import {
  createWorkbookTemplate,
  instantiateWorkbookTemplate,
  type WorkbookTemplate,
} from '@/lib/workbook-template';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
import { summarizeTable } from '@/lib/workbook';
export async function GET() {
  const db = await ensureDatabase();
  const rows = await db
    .prepare(
      'SELECT template FROM workbook_templates ORDER BY created_at DESC LIMIT 30',
    )
    .all<{ template: string }>();
  return Response.json({
    templates: rows.results.map((r) => JSON.parse(r.template)),
  });
}
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action: string;
      name: string;
      tableIds?: string[];
      templateId?: string;
      bindings?: Record<string, string>;
    };
    const db = await ensureDatabase();
    const load = async (id: string) => {
      const row = await db
        .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
        .bind(id)
        .first<{ snapshot: string }>();
      if (!row) throw new Error('Table is unavailable.');
      return JSON.parse(row.snapshot) as WorkspaceSnapshot;
    };
    if (body.action === 'capture') {
      if (
        !Array.isArray(body.tableIds) ||
        !body.tableIds.length ||
        body.tableIds.length > 10 ||
        typeof body.name !== 'string'
      )
        throw new Error('Select one to ten tables and name the template.');
      const tables = await Promise.all(body.tableIds.map(load));
      const template = createWorkbookTemplate(tables, body.name);
      await db
        .prepare(
          'INSERT INTO workbook_templates (id,name,template,created_at) VALUES (?,?,?,?)',
        )
        .bind(
          template.id,
          template.name,
          JSON.stringify(template),
          template.createdAt,
        )
        .run();
      return Response.json({ template }, { status: 201 });
    }
    if (
      body.action !== 'create' ||
      typeof body.templateId !== 'string' ||
      typeof body.name !== 'string'
    )
      throw new Error('Choose a saved template and workbook name.');
    const row = await db
      .prepare('SELECT template FROM workbook_templates WHERE id = ?')
      .bind(body.templateId)
      .first<{ template: string }>();
    if (!row) throw new Error('Template is unavailable.');
    const template = JSON.parse(row.template) as WorkbookTemplate;
    const bindings = body.bindings ?? {};
    const external = await Promise.all(
      [
        ...new Set(
          template.externalTableIds.map((id) => bindings[id]).filter(Boolean),
        ),
      ].map(load),
    );
    const tables = instantiateWorkbookTemplate(
      template,
      body.name,
      bindings,
      external,
    );
    await db.batch(
      tables.map((t) =>
        db
          .prepare(
            'INSERT INTO workspaces (id,name,snapshot,created_at,updated_at) VALUES (?,?,?,?,?)',
          )
          .bind(t.id, t.name, JSON.stringify(t), t.updatedAt, t.updatedAt),
      ),
    );
    return Response.json(
      { tables: tables.map(summarizeTable) },
      { status: 201 },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Workbook template failed.' },
      { status: 400 },
    );
  }
}
