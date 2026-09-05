import type { WorkspaceSnapshot } from './pomade-types';
import { pauseRecipeSchedule } from './recipe-schedule';

export type DeleteRowsResult = {
  workspace: WorkspaceSnapshot;
  removedCount: number;
  schedulePaused: boolean;
};

export function deleteWorkspaceRows(
  workspace: WorkspaceSnapshot,
  rowIds: string[],
  now = Date.now(),
): DeleteRowsResult {
  const removed = new Set(rowIds.filter(Boolean));
  if (!removed.size) {
    return { workspace, removedCount: 0, schedulePaused: false };
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const row of workspace.rows) {
      if (
        row.parentRowId &&
        removed.has(row.parentRowId) &&
        !removed.has(row.id)
      ) {
        removed.add(row.id);
        changed = true;
      }
    }
  }
  const rows = workspace.rows.filter((row) => !removed.has(row.id));
  const removedCount = workspace.rows.length - rows.length;
  if (!removedCount) {
    return { workspace, removedCount: 0, schedulePaused: false };
  }

  let schedule = workspace.schedule;
  let schedulePaused = false;
  if (schedule?.target === 'selected' && schedule.rowIds) {
    const remainingIds = schedule.rowIds.filter((rowId) => !removed.has(rowId));
    schedulePaused = Boolean(schedule.enabled && remainingIds.length === 0);
    schedule = {
      ...(schedulePaused ? pauseRecipeSchedule(schedule, now) : schedule),
      rowIds: remainingIds,
      updatedAt: now,
    };
  }

  return {
    removedCount,
    schedulePaused,
    workspace: {
      ...workspace,
      rows,
      schedule,
      updatedAt: now,
    },
  };
}
