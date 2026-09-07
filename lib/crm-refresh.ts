import {
  applyCrmImport,
  reviewCrmImport,
  savedCrmSource,
  type SavedCrmSource,
} from './crm-import';
import { readCrmSource, type CrmSourceOptions } from './crm-sources';
import type { CrmSourcePreview, WorkspaceSnapshot } from './pomade-types';
export type CrmRefreshSummary = {
  added: number;
  updated: number;
  unchanged: number;
  notReturned: number | null;
  total: number;
  complete: boolean;
};
export type CrmRefreshState = {
  workspaceId: string;
  source: SavedCrmSource;
  cadence: 'manual' | 'every_day' | 'every_week';
  maxRecords: number;
  status: 'idle' | 'running' | 'paused' | 'failed';
  nextRunAt?: number;
  lastRunAt?: number;
  lastError?: string;
  summary?: CrmRefreshSummary;
};
export function refreshInterval(cadence: CrmRefreshState['cadence']) {
  return cadence === 'every_day'
    ? 86_400_000
    : cadence === 'every_week'
      ? 604_800_000
      : 0;
}
export async function readSavedCrmSource(
  workspace: WorkspaceSnapshot,
  maxRecords: number,
  options: CrmSourceOptions,
): Promise<CrmSourcePreview> {
  const source = savedCrmSource(workspace);
  if (!source) throw new Error('Import a CRM source before refreshing.');
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 1000)
    throw new Error('Choose a refresh limit between 1 and 1,000 records.');
  const deadline = AbortSignal.timeout(90_000);
  const fetcher = options.fetchImpl ?? fetch;
  const boundedOptions = {
    ...options,
    fetchImpl: ((input, init) =>
      fetcher(input, {
        ...init,
        signal: AbortSignal.any([
          deadline,
          ...(init?.signal ? [init.signal] : []),
        ]),
      })) as typeof fetch,
  };
  const contacts = new Map<string, CrmSourcePreview['contacts'][number]>();
  const cursors = new Set<string>();
  let after: string | undefined;
  let result: CrmSourcePreview | undefined;
  for (let page = 0; page < 20; page++) {
    result = await readCrmSource(
      source.provider,
      Math.min(100, maxRecords - contacts.size),
      { ...boundedOptions, ...source, after },
    );
    for (const contact of result.contacts)
      contacts.set(contact.nativeId, contact);
    if (!result.nextAfter)
      return { ...result, contacts: [...contacts.values()], truncated: false };
    if (contacts.size >= maxRecords)
      return { ...result, contacts: [...contacts.values()], truncated: true };
    if (cursors.has(result.nextAfter))
      throw new Error(
        'The CRM repeated a page. No data was changed; try again.',
      );
    cursors.add(result.nextAfter);
    after = result.nextAfter;
  }
  throw new Error(
    'The CRM exceeded the refresh page limit. Use a smaller segment.',
  );
}
export function applyCrmRefresh(
  workspace: WorkspaceSnapshot,
  preview: CrmSourcePreview,
) {
  const source = savedCrmSource(workspace);
  if (
    !source ||
    source.provider !== preview.provider ||
    source.objectType !== preview.objectType ||
    (source.segmentId ?? '') !== (preview.segment?.id ?? '')
  )
    throw new Error('The CRM source changed. Preview the new source first.');
  const review = reviewCrmImport(workspace, preview);
  const refreshed = applyCrmImport(workspace, preview, 'append');
  const membershipId = 'crm_membership';
  if (!refreshed.columns.some((c) => c.id === membershipId)) {
    if (refreshed.columns.length >= 100)
      throw new Error('Leave one column available for CRM source membership.');
    refreshed.columns.push({
      id: membershipId,
      title: 'CRM source membership',
      kind: 'text',
      width: 195,
    });
  }
  const incoming = new Set(preview.contacts.map((c) => c.nativeId));
  const label = `${source.provider === 'hubspot' ? 'HubSpot' : 'Salesforce'} ${source.objectType}`;
  refreshed.rows = refreshed.rows.map((row) =>
    row.values.crm_source !== label
      ? row
      : {
          ...row,
          values: {
            ...row.values,
            [membershipId]: incoming.has(row.values.crm_id)
              ? 'In source'
              : preview.truncated
                ? 'Not checked — partial refresh'
                : 'No longer in source',
          },
        },
  );
  return {
    workspace: refreshed,
    summary: {
      added: review.added,
      updated: review.updated,
      unchanged: review.unchanged,
      notReturned: review.notReturned,
      total: preview.contacts.length,
      complete: !preview.truncated,
    },
  };
}
