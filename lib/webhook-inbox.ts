import { pauseRecipeSchedule } from './recipe-schedule';
import type { WorkspaceSnapshot, PomadeRow } from './pomade-types';
export type WebhookEvent = {
  id: string;
  sourceId: string;
  receivedAt: number;
  records: Record<string, unknown>[];
};
export type WebhookSource = {
  id: string;
  tableId: string;
  token: string;
  mode?: 'rows' | 'signals';
};
export function webhookSources(raw?: string): WebhookSource[] {
  if (!raw?.trim()) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Invalid webhook configuration.');
  return Object.entries(parsed).map(([id, value]) => {
    const c = value as Partial<WebhookSource> | null;
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(id) ||
      !c ||
      typeof c.tableId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(c.tableId) ||
      typeof c.token !== 'string' ||
      c.token.length < 32 ||
      (c.mode !== undefined && !['rows', 'signals'].includes(c.mode))
    )
      throw new Error(
        'Webhook sources need a table ID and a token of at least 32 characters.',
      );
    return {
      id,
      tableId: c.tableId,
      token: c.token,
      ...(c.mode ? { mode: c.mode } : {}),
    };
  });
}
export function webhookRecords(payload: unknown): Record<string, unknown>[] {
  const records = Array.isArray(payload) ? payload : [payload];
  if (
    !records.length ||
    records.length > 100 ||
    records.some((r) => !r || typeof r !== 'object' || Array.isArray(r))
  )
    throw new Error('Send one JSON object or an array of 1–100 objects.');
  return records as Record<string, unknown>[];
}
export function webhookValue(
  record: Record<string, unknown>,
  path: string,
): string {
  const value = path
    .split('.')
    .reduce<unknown>(
      (v, key) =>
        v && typeof v === 'object' && Object.hasOwn(v, key)
          ? (v as Record<string, unknown>)[key]
          : undefined,
      record,
    );
  if (value === undefined || value === null) return '';
  const result = typeof value === 'string' ? value : JSON.stringify(value);
  if (result.length > 4000)
    throw new Error(`Field ${path} exceeds 4,000 characters.`);
  return result;
}
export function importWebhookEvents(
  workspace: WorkspaceSnapshot,
  events: WebhookEvent[],
  mapping: Record<string, string>,
) {
  const fields = Object.entries(validateWebhookMapping(workspace, mapping));
  const known = new Set(workspace.rows.map((r) => r.id));
  const added: PomadeRow[] = [];
  let skipped = 0;
  for (const event of events)
    for (const [index, record] of event.records.entries()) {
      const id = `hook_${event.id}_${index}`;
      if (known.has(id)) {
        skipped++;
        continue;
      }
      const values = Object.fromEntries(
        fields.map(([column, path]) => [column, webhookValue(record, path)]),
      );
      if (!Object.values(values).some(Boolean))
        throw new Error(
          'A record has no values at the mapped paths. Check the preview before importing.',
        );
      values.status = 'Review';
      added.push({
        id,
        values,
        webhookSource: {
          sourceId: event.sourceId,
          eventId: event.id,
          receivedAt: event.receivedAt,
        },
      });
      known.add(id);
    }
  if (workspace.rows.length + added.length > 5000)
    throw new Error('Import would exceed the 5,000-row table limit.');
  return {
    workspace: {
      ...workspace,
      schedule:
        added.length && workspace.schedule?.enabled
          ? pauseRecipeSchedule(workspace.schedule)
          : workspace.schedule,
      rows: [...workspace.rows, ...added],
      updatedAt: Date.now(),
    },
    added: added.length,
    skipped,
  };
}

export function validateWebhookMapping(
  workspace: WorkspaceSnapshot,
  mapping: Record<string, string>,
) {
  const fields = Object.entries(mapping).filter(([, path]) => path.trim());
  if (!fields.length) throw new Error('Map at least one input column.');
  for (const [id, path] of fields) {
    if (
      !workspace.columns.some((c) => c.id === id && c.kind === 'text') ||
      !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(path)
    )
      throw new Error('Map valid JSON paths to input text columns only.');
  }
  return Object.fromEntries(fields.map(([id, path]) => [id, path.trim()]));
}
export function saveWebhookMapping(
  workspace: WorkspaceSnapshot,
  sourceId: string,
  mapping: Record<string, string>,
) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(sourceId))
    throw new Error('Choose a webhook source.');
  return {
    ...workspace,
    webhookMappings: {
      ...workspace.webhookMappings,
      [sourceId]: validateWebhookMapping(workspace, mapping),
    },
    updatedAt: Date.now(),
  };
}
