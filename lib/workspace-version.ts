import type {
  WorkspaceSnapshot,
  WorkspaceVersionSummary,
} from './pomade-types';

export const WORKSPACE_VERSION_LIMIT = 20;

export type WorkspaceVersionReason =
  | 'Grid edit'
  | 'Recipe run'
  | 'Apollo enrichment'
  | 'Background run queued'
  | 'Version restore';

export function workspaceContent(workspace: WorkspaceSnapshot) {
  const { updatedAt: _updatedAt, ...content } = workspace;
  return content;
}

export function workspaceContentMatches(
  first: WorkspaceSnapshot,
  second: WorkspaceSnapshot,
) {
  return (
    JSON.stringify(workspaceContent(first)) ===
    JSON.stringify(workspaceContent(second))
  );
}

export function summarizeWorkspaceVersion(
  id: string,
  reason: string,
  createdAt: number,
  workspace: WorkspaceSnapshot,
): WorkspaceVersionSummary {
  return {
    id,
    reason,
    createdAt,
    rowCount: workspace.rows.length,
    columnCount: workspace.columns.length,
    sourceLabel: workspace.source?.label,
  };
}

export function prepareRestoredWorkspace(
  workspace: WorkspaceSnapshot,
  restoredAt: number,
): WorkspaceSnapshot {
  return {
    ...workspace,
    schedule: workspace.schedule
      ? {
          ...workspace.schedule,
          enabled: false,
          state: 'paused',
          leaseUntil: undefined,
          updatedAt: restoredAt,
        }
      : undefined,
    updatedAt: restoredAt,
  };
}
