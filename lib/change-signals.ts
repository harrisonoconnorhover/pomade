import type { WorkspaceSnapshot } from './pomade-types';
export type SignalKind =
  | 'field'
  | 'hiring'
  | 'leadership'
  | 'technology'
  | 'website'
  | 'g2'
  | 'linkedin';
export type SignalWatch = {
  kind?: SignalKind;
  mode?: 'value' | 'set';
  sourceColumnId?: string;
  trackRemovals?: boolean;
  id: string;
  name: string;
  columnId: string;
  ignoreEmpty: boolean;
};
export type SignalBatch = {
  id: string;
  workspaceId: string;
  origin: string;
  createdAt: number;
  totalChanges: number;
  omittedChanges: number;
  events: {
    kind?: SignalKind;
    change?: 'changed' | 'added' | 'removed' | 'reported';
    sourceUrl?: string;
    occurredAt?: number;
    source?: string;
    rowId: string;
    rowLabel: string;
    watchId: string;
    watchName: string;
    columnId: string;
    before: string;
    after: string;
    truncated: boolean;
  }[];
};
export function saveSignalWatch(
  workspace: WorkspaceSnapshot,
  watch: SignalWatch,
) {
  if (
    (watch.mode !== undefined && !['value', 'set'].includes(watch.mode)) ||
    (watch.kind !== undefined &&
      ![
        'field',
        'hiring',
        'leadership',
        'technology',
        'website',
        'g2',
        'linkedin',
      ].includes(watch.kind)) ||
    (watch.sourceColumnId !== undefined &&
      !workspace.columns.some(
        (c) => c.id === watch.sourceColumnId && c.kind !== 'status',
      )) ||
    !watch.name.trim() ||
    watch.name.length > 80 ||
    !workspace.columns.some(
      (c) => c.id === watch.columnId && c.kind !== 'status',
    )
  )
    throw new Error('Name the watch and choose an existing data column.');
  const watches = [
    ...(workspace.signalWatches ?? []).filter((w) => w.id !== watch.id),
    { ...watch, name: watch.name.trim() },
  ];
  if (watches.length > 10)
    throw new Error('Use up to ten watched fields per table.');
  return { ...workspace, signalWatches: watches, updatedAt: Date.now() };
}
export function safeSignalUrl(value?: string) {
  try {
    const url = new URL(value ?? '');
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
export function signalItems(value: string): Map<string, string> {
  let items: string[];
  if (value.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string'))
        throw new Error();
      items = parsed;
    } catch {
      return new Map();
    }
  } else items = value.split(/;|\n/);
  return new Map(
    items
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => [s.toLowerCase(), s]),
  );
}
export function detectSignalChanges(
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot,
  options: {
    id: string;
    origin: string;
    columnIds?: string[];
    rowIds?: string[];
  },
): SignalBatch | null {
  const watched = (before.signalWatches ?? []).filter(
    (w) =>
      after.signalWatches?.some(
        (current) => current.id === w.id && current.columnId === w.columnId,
      ) &&
      after.columns.some((c) => c.id === w.columnId) &&
      (options.columnIds === undefined ||
        options.columnIds.includes(w.columnId)),
  );
  const previous = new Map(before.rows.map((r) => [r.id, r]));
  const events: SignalBatch['events'] = [];
  let totalChanges = 0;
  for (const row of after.rows) {
    if (options.rowIds && !options.rowIds.includes(row.id)) continue;
    const old = previous.get(row.id);
    if (!old) continue;
    for (const watch of watched) {
      const prior = old.values[watch.columnId] ?? '',
        next = row.values[watch.columnId] ?? '';
      if (
        watch.sourceColumnId &&
        (!safeSignalUrl(old.values[watch.sourceColumnId]) ||
          !safeSignalUrl(row.values[watch.sourceColumnId]))
      )
        continue;
      if (
        prior === next ||
        (watch.ignoreEmpty && (!prior.trim() || !next.trim()))
      )
        continue;
      const items = (value: string) =>
        signalItems(
          watch.kind === 'hiring'
            ? value.replace(/;\s*(https?:\/\/[^;\s]+)/g, ': $1')
            : value,
        );
      const previousItems = items(prior),
        nextItems = items(next);
      // A missing/invalid list is not evidence that every item disappeared.
      if (
        watch.mode === 'set' &&
        ((!previousItems.size && prior.trim() !== '[]' && prior.trim()) ||
          (!nextItems.size && next.trim() !== '[]' && next.trim()))
      )
        continue;
      const roleChanges: {
        before: string;
        after: string;
        change: 'changed';
      }[] = [];
      if (watch.mode === 'set' && watch.kind === 'leadership') {
        const identity = (item: string) =>
          item.includes('|')
            ? item.split('|')[0].split(',')[0].trim().toLowerCase()
            : '';
        for (const [nextKey, item] of nextItems) {
          if (previousItems.has(nextKey) || !identity(item)) continue;
          const matches = [...previousItems].filter(
            ([, oldItem]) => identity(oldItem) === identity(item),
          );
          if (matches.length !== 1) continue;
          const [oldKey, oldItem] = matches[0];
          const oldTitle = oldItem
            .split('|')
            .slice(1)
            .join('|')
            .trim()
            .toLowerCase();
          const title = item.split('|').slice(1).join('|').trim().toLowerCase();
          if (oldTitle !== title)
            roleChanges.push({
              before: oldItem,
              after: item,
              change: 'changed',
            });
          // Degree suffixes and capitalization do not establish a new person.
          previousItems.delete(oldKey);
          nextItems.delete(nextKey);
        }
      }
      const changes: {
        before: string;
        after: string;
        change: 'added' | 'removed' | 'changed';
      }[] =
        watch.mode === 'set'
          ? [
              ...roleChanges,
              ...[...nextItems]
                .filter(([key]) => !previousItems.has(key))
                .map(([, item]) => ({
                  before: '',
                  after: item,
                  change: 'added' as const,
                })),
              ...(watch.trackRemovals === false
                ? []
                : [...previousItems]
                    .filter(([key]) => !nextItems.has(key))
                    .map(([, item]) => ({
                      before: item,
                      after: '',
                      change: 'removed' as const,
                    }))),
            ]
          : [{ before: prior, after: next, change: 'changed' }];
      for (const change of changes) {
        totalChanges++;
        if (events.length < 200)
          events.push({
            rowId: row.id,
            rowLabel: (row.values.person || row.values.company || row.id).slice(
              0,
              160,
            ),
            watchId: watch.id,
            watchName: watch.name,
            columnId: watch.columnId,
            ...change,
            before: change.before.slice(0, 500),
            after: change.after.slice(0, 500),
            truncated: change.before.length > 500 || change.after.length > 500,
            kind: watch.kind ?? 'field',
            source: options.origin,
            sourceUrl: safeSignalUrl(
              watch.sourceColumnId
                ? row.values[watch.sourceColumnId]
                : undefined,
            ),
          });
      }
    }
  }
  return totalChanges
    ? {
        id: options.id,
        workspaceId: after.id,
        origin: options.origin,
        createdAt: Date.now(),
        totalChanges,
        omittedChanges: totalChanges - events.length,
        events,
      }
    : null;
}
