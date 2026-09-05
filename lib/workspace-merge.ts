import type { WorkspaceSnapshot } from './pomade-types';
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function merge(
  base: unknown,
  local: unknown,
  remote: unknown,
  path: string,
): unknown {
  if (same(local, base)) return remote;
  if (same(remote, base) || same(local, remote)) return local;
  if (
    path === 'rows' &&
    Array.isArray(base) &&
    Array.isArray(local) &&
    Array.isArray(remote)
  ) {
    const index = (rows: { id: string }[]) =>
      new Map(rows.map((r) => [r.id, r]));
    const b = index(base),
      l = index(local),
      r = index(remote);
    return [...new Set([...l.keys(), ...r.keys()])]
      .map((id) => merge(b.get(id), l.get(id), r.get(id), `rows.${id}`))
      .filter((v) => v !== undefined);
  }
  if (
    base &&
    local &&
    remote &&
    typeof base === 'object' &&
    typeof local === 'object' &&
    typeof remote === 'object' &&
    !Array.isArray(base) &&
    !Array.isArray(local) &&
    !Array.isArray(remote)
  ) {
    const b = base as Record<string, unknown>,
      l = local as Record<string, unknown>,
      r = remote as Record<string, unknown>;
    return Object.fromEntries(
      [...new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])]
        .map((k) => [k, merge(b[k], l[k], r[k], path ? `${path}.${k}` : k)])
        .filter(([, v]) => v !== undefined),
    );
  }
  throw new Error(
    `Save conflict at ${path}. Your edits remain in this tab; reload the table after preserving them.`,
  );
}
export function mergeWorkspaceEdits(
  base: WorkspaceSnapshot,
  local: WorkspaceSnapshot,
  remote: WorkspaceSnapshot,
): WorkspaceSnapshot {
  if (base.id !== local.id || base.id !== remote.id)
    throw new Error('Table mismatch.');
  const clean = (w: WorkspaceSnapshot) => ({ ...w, revision: 0, updatedAt: 0 });
  const result = merge(
    clean(base),
    clean(local),
    clean(remote),
    '',
  ) as WorkspaceSnapshot;
  return { ...result, revision: remote.revision ?? 0, updatedAt: Date.now() };
}
