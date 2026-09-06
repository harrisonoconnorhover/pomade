import type { HubSpotSegment } from './pomade-types';

export type HubSpotSegmentOptions = {
  hubSpotAccessToken?: string;
  fetchImpl?: typeof fetch;
};

export class HubSpotSegmentError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'HubSpotSegmentError';
  }
}

const objectIds = { contact: '0-1', company: '0-2' } as const;
const objectTypes = { '0-1': 'contact', '0-2': 'company' } as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function segment(value: unknown): HubSpotSegment {
  const item = record(value);
  const objectType = objectTypes[item.objectTypeId as keyof typeof objectTypes];
  if (
    !objectType ||
    typeof item.listId !== 'string' ||
    typeof item.name !== 'string'
  ) {
    throw new HubSpotSegmentError('HubSpot returned an unsupported segment.');
  }
  const rawSize = record(item.additionalProperties).hs_list_size;
  const size =
    rawSize === undefined || rawSize === null || rawSize === ''
      ? NaN
      : Number(rawSize);
  return {
    id: item.listId,
    name: item.name,
    objectType,
    processingType:
      typeof item.processingType === 'string' ? item.processingType : '',
    ...(Number.isSafeInteger(size) && size >= 0 ? { size } : {}),
  };
}

async function request(
  path: string,
  options: HubSpotSegmentOptions,
  body?: unknown,
) {
  const token = options.hubSpotAccessToken?.trim();
  if (!token) throw new HubSpotSegmentError('HubSpot is not configured.', 503);
  const response = await (options.fetchImpl ?? fetch)(
    new URL(path, 'https://api.hubapi.com'),
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    },
  );
  if (response.status === 403) {
    throw new HubSpotSegmentError(
      'HubSpot needs segment read access. Enable crm.lists.read (or crm.segments.read) on the existing connection, then refresh segments.',
      403,
    );
  }
  if (response.status === 404) {
    throw new HubSpotSegmentError(
      'This HubSpot segment no longer exists. Refresh segments and choose another.',
      404,
    );
  }
  if (!response.ok) {
    throw new HubSpotSegmentError(
      `HubSpot segment request failed with HTTP ${response.status}.`,
    );
  }
  return record(await response.json());
}

export async function listHubSpotSegments(
  objectType: 'contact' | 'company',
  options: HubSpotSegmentOptions,
): Promise<HubSpotSegment[]> {
  const segments = new Map<string, HubSpotSegment>();
  let offset = 0;
  for (;;) {
    const payload = await request('/crm/v3/lists/search', options, {
      objectTypeId: objectIds[objectType],
      count: 100,
      offset,
      additionalProperties: ['hs_list_size'],
    });
    if (!Array.isArray(payload.lists))
      throw new HubSpotSegmentError(
        'HubSpot returned an invalid segment catalog.',
      );
    for (const value of payload.lists) {
      const entry = segment(value);
      if (entry.objectType === objectType) segments.set(entry.id, entry);
    }
    if (payload.hasMore !== true) break;
    const next = Number(payload.offset);
    if (!Number.isSafeInteger(next) || next <= offset) {
      throw new HubSpotSegmentError(
        'HubSpot did not advance the segment catalog page. Please refresh segments.',
      );
    }
    offset = next;
  }
  return [...segments.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function readHubSpotSegmentPage(
  segmentId: string,
  objectType: 'contact' | 'company',
  limit: number,
  after: string | undefined,
  options: HubSpotSegmentOptions,
) {
  if (!/^\d{1,30}$/.test(segmentId))
    throw new HubSpotSegmentError('Choose a valid HubSpot segment.', 400);
  if (
    after !== undefined &&
    (typeof after !== 'string' || !after || after.length > 500)
  ) {
    throw new HubSpotSegmentError('Invalid segment page cursor.', 400);
  }
  const detail = await request(`/crm/v3/lists/${segmentId}`, options);
  const selected = segment(detail.list ?? detail);
  if (selected.objectType !== objectType) {
    throw new HubSpotSegmentError(
      'The segment contains a different record type. Choose a matching segment.',
      400,
    );
  }
  const params = new URLSearchParams({ limit: String(limit) });
  if (after) params.set('after', after);
  const payload = await request(
    `/crm/v3/lists/${segmentId}/memberships?${params}`,
    options,
  );
  if (!Array.isArray(payload.results))
    throw new HubSpotSegmentError(
      'HubSpot returned invalid segment memberships.',
    );
  const recordIds = [
    ...new Set(payload.results.map((value) => record(value).recordId)),
  ];
  if (
    recordIds.length > limit ||
    recordIds.some((id) => typeof id !== 'string' || !/^\d{1,30}$/.test(id))
  ) {
    throw new HubSpotSegmentError(
      'HubSpot returned invalid segment record IDs.',
    );
  }
  const next = record(record(payload.paging).next).after;
  if (
    next !== undefined &&
    (typeof next !== 'string' || !next || next === after || next.length > 500)
  ) {
    throw new HubSpotSegmentError(
      'HubSpot did not advance the segment member page. Retry the preview.',
    );
  }
  return {
    segment: selected,
    recordIds: recordIds as string[],
    nextAfter: next as string | undefined,
  };
}
