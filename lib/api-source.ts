import {
  boundedJson,
  jsonPath,
  prepareHttpRequest,
  type HttpConnection,
} from './http-enrichment';
import { validateWebhookMapping, webhookValue } from './webhook-inbox';
import { pauseRecipeSchedule } from './recipe-schedule';
import type { WorkspaceSnapshot } from './pomade-types';
export type ApiSourceConfig = {
  connectionId: string;
  method: 'GET' | 'POST';
  path: string;
  body?: string;
  recordsPath: string;
  identityPath?: string;
  pagination: 'none' | 'page' | 'offset' | 'cursor';
  parameter: string;
  start: number;
  pageSize: number;
  sizeParameter?: string;
  cursorPath: string;
  maxPages: number;
  maxRows: number;
};
export type ApiSourceBatch = {
  id: string;
  workspaceId: string;
  config: ApiSourceConfig;
  createdAt: number;
  records: { id: string; value: Record<string, unknown> }[];
  requests: number;
  pages: number;
  status: 'complete' | 'limited' | 'partial' | 'failed';
  reason: string;
  creditsConsumed: null;
  externalWrites: 'unknown';
};
export function validateApiSource(config: ApiSourceConfig) {
  if (
    !config ||
    typeof config.connectionId !== 'string' ||
    !['GET', 'POST'].includes(config.method) ||
    typeof config.path !== 'string' ||
    !config.path.startsWith('/') ||
    config.path.startsWith('//') ||
    config.path.includes('\\') ||
    config.path.includes('{{')
  )
    throw new Error(
      'Choose a connection, method and relative path without row tokens.',
    );
  const validPath = (p: unknown) =>
    typeof p === 'string' &&
    (p === '$' || /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(p));
  if (
    !validPath(config.recordsPath) ||
    (config.identityPath && !validPath(config.identityPath))
  )
    throw new Error('Choose valid JSON paths for records and identity.');
  if (
    !['none', 'page', 'offset', 'cursor'].includes(config.pagination) ||
    !Number.isInteger(config.maxPages) ||
    config.maxPages < 1 ||
    config.maxPages > 10 ||
    !Number.isInteger(config.maxRows) ||
    config.maxRows < 1 ||
    config.maxRows > 500
  )
    throw new Error('Limit the source to 1–10 pages and 1–500 records.');
  if (
    config.pagination !== 'none' &&
    (!/^[a-zA-Z0-9_-]+$/.test(config.parameter) ||
      !Number.isSafeInteger(config.start) ||
      config.start < 0 ||
      !Number.isInteger(config.pageSize) ||
      config.pageSize < 1 ||
      config.pageSize > 500)
  )
    throw new Error(
      'Choose a pagination parameter, nonnegative start and page size of 1–500.',
    );
  if (
    config.sizeParameter &&
    (!/^[a-zA-Z0-9_-]+$/.test(config.sizeParameter) ||
      !Number.isInteger(config.pageSize) ||
      config.pageSize < 1 ||
      config.pageSize > 500)
  )
    throw new Error('Choose a valid page-size parameter.');
  if (config.pagination === 'cursor' && !validPath(config.cursorPath))
    throw new Error('Choose the next-cursor response path.');
}
async function digest(text: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function fetchApiSource(
  workspaceId: string,
  config: ApiSourceConfig,
  connection: HttpConnection,
  fetcher: typeof fetch = fetch,
): Promise<ApiSourceBatch> {
  validateApiSource(config);
  const batch: ApiSourceBatch = {
    id: crypto.randomUUID(),
    workspaceId,
    config,
    createdAt: Date.now(),
    records: [],
    requests: 0,
    pages: 0,
    status: 'limited',
    reason: 'Page limit reached; more records may exist.',
    creditsConsumed: null,
    externalWrites: 'unknown',
  };
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let storedBytes = 0;
  let cursor = '';
  let offset = config.start;
  try {
    for (
      let page = 0;
      page < (config.pagination === 'none' ? 1 : config.maxPages);
      page++
    ) {
      const request = prepareHttpRequest(
        {
          id: 'source',
          title: 'API source',
          kind: 'enrichment',
          width: 180,
          http: {
            connectionId: config.connectionId,
            method: config.method,
            pathTemplate: config.path,
            bodyTemplate: config.body,
            outputs: [],
            statusColumnId: 'status',
          },
        },
        { id: 'source', values: {} },
        connection,
      );
      const url = new URL(request.url);
      if (config.sizeParameter)
        url.searchParams.set(config.sizeParameter, String(config.pageSize));
      if (config.pagination === 'page')
        url.searchParams.set(config.parameter, String(config.start + page));
      if (config.pagination === 'offset')
        url.searchParams.set(config.parameter, String(offset));
      if (config.pagination === 'cursor' && cursor)
        url.searchParams.set(config.parameter, cursor);
      batch.requests++;
      let response: Response;
      try {
        response = await fetcher(url, {
          ...request.init,
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        throw new Error('Request failed or timed out; no automatic retry.');
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}; request was not retried.`);
      }
      const data = await boundedJson(response);
      const records = jsonPath(data, config.recordsPath);
      if (
        !Array.isArray(records) ||
        records.some((r) => !r || typeof r !== 'object' || Array.isArray(r))
      )
        throw new Error('Records path must contain an array of JSON objects.');
      batch.pages++;
      for (const value of records as Record<string, unknown>[]) {
        let identity: unknown;
        if (config.identityPath) {
          identity = jsonPath(value, config.identityPath);
          if (
            (typeof identity !== 'string' && typeof identity !== 'number') ||
            identity === ''
          )
            throw new Error(
              'A record is missing its configured stable ID. Earlier records are retained.',
            );
        }
        const id =
          identity !== undefined
            ? `api_${await digest(`${config.connectionId}\n${config.path}\n${JSON.stringify(identity)}`)}`
            : `api_${batch.id}_${batch.records.length}`;
        if (ids.has(id)) continue;
        if (batch.records.length >= config.maxRows) {
          batch.reason = 'Record limit reached; more records may exist.';
          return batch;
        }
        storedBytes += new TextEncoder().encode(
          JSON.stringify(value),
        ).byteLength;
        if (storedBytes > 750000) {
          batch.reason =
            'Batch storage limit reached; request fewer response fields.';
          return batch;
        }
        ids.add(id);
        batch.records.push({ id, value });
      }
      if (config.pagination === 'none' || records.length === 0) {
        batch.status = 'complete';
        batch.reason =
          config.pagination === 'none'
            ? 'Single page fetched.'
            : 'Empty page reached.';
        return batch;
      }
      if (config.pagination === 'cursor') {
        const next = jsonPath(data, config.cursorPath);
        if (next === undefined || next === null || next === '') {
          batch.status = 'complete';
          batch.reason = 'No next cursor.';
          return batch;
        }
        if (typeof next !== 'string' && typeof next !== 'number')
          throw new Error('Next cursor must be a string or number.');
        cursor = String(next);
        if (cursors.has(cursor))
          throw new Error('Repeated next cursor; pagination stopped.');
        cursors.add(cursor);
      }
      offset += records.length;
      if (batch.records.length >= config.maxRows) {
        batch.reason = 'Record limit reached; more records may exist.';
        return batch;
      }
    }
  } catch (error) {
    batch.status = batch.records.length ? 'partial' : 'failed';
    batch.reason = error instanceof Error ? error.message : 'Source failed.';
  }
  return batch;
}
export function importApiSource(
  workspace: WorkspaceSnapshot,
  batch: ApiSourceBatch,
  mapping: Record<string, string>,
) {
  if (batch.workspaceId !== workspace.id)
    throw new Error('This batch belongs to another table.');
  const fields = Object.entries(validateWebhookMapping(workspace, mapping));
  const existing = new Set(workspace.rows.map((r) => r.id));
  let skipped = 0;
  const rows = batch.records.flatMap((record) => {
    if (existing.has(record.id)) {
      skipped++;
      return [];
    }
    const values = Object.fromEntries(
      fields.map(([id, path]) => [id, webhookValue(record.value, path)]),
    );
    if (!Object.values(values).some(Boolean))
      throw new Error('A record has no values at the mapped paths.');
    existing.add(record.id);
    return [
      {
        id: record.id,
        values: { ...values, status: 'Review' },
        apiSource: {
          batchId: batch.id,
          connectionId: batch.config.connectionId,
          fetchedAt: batch.createdAt,
        },
      },
    ];
  });
  if (workspace.rows.length + rows.length > 5000)
    throw new Error('Import exceeds the 5,000-row table limit.');
  return {
    workspace: {
      ...workspace,
      rows: [...workspace.rows, ...rows],
      schedule:
        rows.length && workspace.schedule?.enabled
          ? pauseRecipeSchedule(workspace.schedule)
          : workspace.schedule,
      updatedAt: Date.now(),
    },
    added: rows.length,
    skipped,
  };
}
