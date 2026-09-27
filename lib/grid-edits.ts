import type { PomadeRow, WorkspaceSnapshot } from './pomade-types';
import { recalculateAutomaticFormulas } from './local-recipe-engine';

// Glide can deliver several edits before React renders fresh row props.
// Apply each cell to the latest row so paste/clear never restores stale cells.
export function applyGridEdits(
  workspace: WorkspaceSnapshot,
  changedRows: PomadeRow[],
  editedColumnId?: string,
): WorkspaceSnapshot {
  const changes = new Map(changedRows.map((row) => [row.id, row]));
  let edited = false;
  const rows = workspace.rows.map((row) => {
    const changed = changes.get(row.id);
    if (!changed) return row;
    const values = editedColumnId
      ? {
          ...row.values,
          [editedColumnId]: changed.values[editedColumnId] ?? '',
        }
      : { ...row.values, ...changed.values };
    const hasChange = Object.entries(values).some(
      ([id, value]) => id !== 'status' && value !== (row.values[id] ?? ''),
    );
    if (!hasChange) return row;
    edited = true;
    // Receipts describe the previous inputs. Preserve values until rerun,
    // but never present an edited row as having passed those checks.
    values.status = 'Draft';
    return recalculateAutomaticFormulas(
      { ...row, values },
      workspace.columns,
      editedColumnId,
    );
  });
  if (!edited) return workspace;
  return {
    ...workspace,
    rows,
    updatedAt: Date.now(),
  };
}

export function visibleSelection(
  rows: PomadeRow[],
  selectedIds: string[],
  activeId: string,
) {
  const ids = new Set(rows.map((row) => row.id));
  return {
    selectedIds: selectedIds.filter((id) => ids.has(id)),
    active: rows.find((row) => row.id === activeId) ?? rows[0],
  };
}
