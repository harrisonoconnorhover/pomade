import { z } from 'zod';
import {
  PomadeApiError,
  type ApiScope,
  type PomadeApiKey,
} from './pomade-api-auth';
import { summarizeTable, type TableSummary } from './workbook';
import type { WorkspaceSnapshot, RunReceipt } from './pomade-types';
import type { CrmSyncConfig } from './crm-sync';

export interface PomadeApiBackend {
  listTables(this: void): Promise<TableSummary[]>;
  loadTable(this: void, id: string): Promise<WorkspaceSnapshot | null>;
  runRecipe(
    this: void,
    workspace: WorkspaceSnapshot,
    rowIds: string[],
    columnIds: string[],
    allowExternalRequests: boolean,
  ): Promise<{ workspace: WorkspaceSnapshot; run: RunReceipt }>;
  listRuns(this: void, tableId: string): Promise<unknown>;
  readCrm(this: void, input: unknown): Promise<unknown>;
  previewCrm(
    this: void,
    tableId: string,
    rowIds: string[],
    config: CrmSyncConfig,
  ): Promise<unknown>;
  getCrmPlan(this: void, planId: string): Promise<unknown>;
  executeCrm(this: void, planId: string): Promise<unknown>;
}
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const rowIds = z
  .array(id)
  .min(1)
  .max(25)
  .refine((v) => new Set(v).size === v.length, 'Choose distinct rows.');
const page = {
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(25),
};
const filterSchema = z
  .object({
    columnId: id,
    operator: z.enum([
      'equals',
      'contains',
      'greater_than_or_equal',
      'less_than_or_equal',
    ]),
    value: z.string().max(200),
  })
  .strict();
async function table(backend: PomadeApiBackend, tableId: string) {
  const workspace = await backend.loadTable(tableId);
  if (!workspace) throw new PomadeApiError(404, 'Table not found.');
  return workspace;
}
function checkRows(workspace: WorkspaceSnapshot, ids: string[]) {
  if (ids.some((id) => !workspace.rows.some((row) => row.id === id)))
    throw new PomadeApiError(409, 'One or more selected rows no longer exist.');
}
function paginated<T>(items: T[], offset: number, limit: number) {
  return {
    rows: items.slice(offset, offset + limit),
    totalRows: items.length,
    nextOffset: offset + limit < items.length ? offset + limit : null,
  };
}
function matches(value: string, filter: z.infer<typeof filterSchema>) {
  if (filter.operator === 'equals')
    return value.toLowerCase() === filter.value.toLowerCase();
  if (filter.operator === 'contains')
    return value.toLowerCase().includes(filter.value.toLowerCase());
  if (!value.trim() || !filter.value.trim()) return false;
  const a = Number(value),
    b = Number(filter.value);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return filter.operator === 'greater_than_or_equal' ? a >= b : a <= b;
}
function defineTool<S extends z.ZodObject>(
  scope: ApiScope,
  description: string,
  schema: S,
  execute: (input: z.infer<S>, backend: PomadeApiBackend) => Promise<unknown>,
  readOnly = true,
  openWorld = false,
) {
  return {
    scope,
    description,
    schema,
    execute: (input: unknown, backend: PomadeApiBackend) => {
      const parsed = schema.safeParse(input);
      if (!parsed.success)
        throw new PomadeApiError(
          400,
          parsed.error.issues
            .map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`)
            .join('; '),
        );
      return execute(parsed.data, backend);
    },
    annotations: {
      readOnlyHint: readOnly,
      destructiveHint: scope === 'crm:write',
      openWorldHint: openWorld,
    },
  };
}
export const pomadeTools = {
  list_tables: defineTool(
    'read',
    'List saved Pomade tables. These are local workbook records, not a worldwide company database.',
    z.object({}).strict(),
    async (_, b) => ({ tables: await b.listTables() }),
  ),
  get_table: defineTool(
    'read',
    'Read table columns, recipe definitions, saved CRM mappings and a page of rows including research evidence. Use returned IDs for subsequent tools.',
    z.object({ tableId: id, ...page }).strict(),
    async (a, b) => {
      const w = await table(b, a.tableId);
      return {
        table: summarizeTable(w),
        revision: w.revision ?? 0,
        columns: w.columns,
        crmMappings: w.crmMappings ?? [],
        ...paginated(w.rows, a.offset, a.limit),
      };
    },
  ),
  search_rows: defineTool(
    'read',
    'Search an existing saved table by text and optional AND filters. Searches stored values only; it does not discover new companies or verify data.',
    z
      .object({
        tableId: id,
        query: z.string().max(200).default(''),
        filters: z.array(filterSchema).max(10).default([]),
        ...page,
      })
      .strict(),
    async (a, b) => {
      const w = await table(b, a.tableId);
      if (a.filters.some((f) => !w.columns.some((c) => c.id === f.columnId)))
        throw new PomadeApiError(400, 'Unknown filter column.');
      const rows = w.rows.filter(
        (r) =>
          Object.values(r.values).some((v) =>
            v.toLowerCase().includes(a.query.toLowerCase()),
          ) && a.filters.every((f) => matches(r.values[f.columnId] ?? '', f)),
      );
      return {
        tableId: w.id,
        source: 'saved_table',
        ...paginated(rows, a.offset, a.limit),
      };
    },
  ),
  run_recipe: defineTool(
    'run',
    'Run existing recipe columns on explicitly selected rows and save the results. Supports configured web research, enrichment waterfalls and formulas. External calls consume provider credits or subscription usage; set allowExternalRequests only when authorized. Existing conditions, cache and 10-external-action limit apply. Never automatically retry a timed-out run; inspect list_runs first.',
    z
      .object({
        tableId: id,
        rowIds,
        columnIds: z.array(id).min(1).max(10),
        allowExternalRequests: z.boolean().default(false),
      })
      .strict(),
    async (a, b) => {
      const w = await table(b, a.tableId);
      checkRows(w, a.rowIds);
      if (
        new Set(a.columnIds).size !== a.columnIds.length ||
        a.columnIds.some(
          (id) =>
            !w.columns.some(
              (c) =>
                c.id === id &&
                (c.kind === 'formula' || c.kind === 'enrichment'),
            ),
        )
      )
        throw new PomadeApiError(
          400,
          'Choose distinct existing recipe columns.',
        );
      const result = await b.runRecipe(
        w,
        a.rowIds,
        a.columnIds,
        a.allowExternalRequests,
      );
      return {
        tableId: w.id,
        run: result.run,
        rows: result.workspace.rows.filter((r) => a.rowIds.includes(r.id)),
      };
    },
    false,
    true,
  ),
  list_runs: defineTool(
    'read',
    'Read the ten latest saved run receipts, including provider errors, cache use and citations. Check here after an uncertain run before retrying.',
    z.object({ tableId: id }).strict(),
    async (a, b) => {
      await table(b, a.tableId);
      return b.listRuns(a.tableId);
    },
  ),
  read_crm: defineTool(
    'crm:read',
    'Read existing HubSpot or Salesforce records using Pomade’s saved connection. Does not write to the CRM or import into a table. Results may be truncated; recordIds narrows to specific records.',
    z
      .object({
        provider: z.enum(['hubspot', 'salesforce']),
        objectType: z.enum(['company', 'account', 'contact', 'lead']),
        limit: z.number().int().min(1).max(100).default(25),
        recordIds: z
          .array(z.string().min(1).max(80))
          .min(1)
          .max(100)
          .optional(),
        fields: z
          .array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/))
          .max(20)
          .optional(),
      })
      .strict(),
    async (a, b) => {
      if (
        (a.provider === 'hubspot' &&
          !['company', 'contact'].includes(a.objectType)) ||
        (a.provider === 'salesforce' && a.objectType === 'company')
      )
        throw new PomadeApiError(
          400,
          'Unsupported CRM object for this provider.',
        );
      return b.readCrm(a);
    },
    true,
    true,
  ),
  preview_crm_sync: defineTool(
    'crm:read',
    'Prepare and save a CRM write preview for selected rows using an existing saved mapping from get_table. Reads the CRM but does not change it. Inspect actions before executing.',
    z.object({ tableId: id, rowIds, mappingId: id }).strict(),
    async (a, b) => {
      const w = await table(b, a.tableId);
      checkRows(w, a.rowIds);
      const mapping = w.crmMappings?.find((m) => m.id === a.mappingId);
      if (!mapping)
        throw new PomadeApiError(
          404,
          'Saved CRM mapping not found. Configure it in Pomade first.',
        );
      return b.previewCrm(w.id, a.rowIds, mapping.config);
    },
    false,
    true,
  ),
  get_crm_plan: defineTool(
    'crm:read',
    'Read a saved CRM preview or execution receipt by plan ID, including native verification and uncertain outcomes.',
    z.object({ planId: id }).strict(),
    async (a, b) => {
      const plan = await b.getCrmPlan(a.planId);
      if (!plan) throw new PomadeApiError(404, 'CRM plan not found.');
      return { plan };
    },
  ),
  execute_crm_sync: defineTool(
    'crm:write',
    'Execute a previously inspected CRM preview. May create/update CRM records and trigger existing CRM workflows. Only use within the user’s authorized write scope and supply confirmWrite:true. Requires an unchanged table revision; Pomade verifies native results. Inspect the plan after any timeout instead of making a new preview.',
    z.object({ planId: id, confirmWrite: z.literal(true) }).strict(),
    async (a, b) => b.executeCrm(a.planId),
    false,
    true,
  ),
};
export function apiCatalog(key: PomadeApiKey) {
  return {
    name: 'Pomade',
    version: '1',
    mode: 'local',
    key: { id: key.id, name: key.name, scopes: key.scopes },
    tools: Object.entries(pomadeTools)
      .filter(([, t]) => key.scopes.includes(t.scope))
      .map(([name, t]) => ({
        name,
        description: t.description,
        inputSchema: z.toJSONSchema(t.schema),
        annotations: t.annotations,
      })),
  };
}
export async function callPomadeTool(
  name: string,
  input: unknown,
  key: PomadeApiKey,
  backend: PomadeApiBackend,
) {
  if (!Object.hasOwn(pomadeTools, name))
    throw new PomadeApiError(404, 'Unknown Pomade tool.');
  const tool = pomadeTools[name as keyof typeof pomadeTools];
  if (!key.scopes.includes(tool.scope))
    throw new PomadeApiError(403, `This key requires the ${tool.scope} scope.`);
  return tool.execute(input, backend);
}
