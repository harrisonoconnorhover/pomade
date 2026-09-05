import type { WorkspaceSnapshot } from './pomade-types';
export type SignalWatch = {
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
        prior === next ||
        (watch.ignoreEmpty && (!prior.trim() || !next.trim()))
      )
        continue;
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
          before: prior.slice(0, 500),
          after: next.slice(0, 500),
          truncated: prior.length > 500 || next.length > 500,
        });
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
