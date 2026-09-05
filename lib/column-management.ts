import type { WorkspaceSnapshot } from './pomade-types';

export function renameWorkspaceColumn(
  workspace: WorkspaceSnapshot,
  columnId: string,
  title: string,
  now = Date.now(),
): WorkspaceSnapshot {
  const column = workspace.columns.find(
    (candidate) => candidate.id === columnId,
  );
  if (!column) throw new Error('The column no longer exists.');
  const nextTitle = title.replace(/\s+/g, ' ').trim();
  if (!nextTitle || nextTitle.length > 80) {
    throw new Error('Column names require between 1 and 80 characters.');
  }
  if (
    workspace.columns.some(
      (candidate) =>
        candidate.id !== columnId &&
        candidate.title.trim().toLowerCase() === nextTitle.toLowerCase(),
    )
  ) {
    throw new Error('Another column already uses that name.');
  }
  if (column.title === nextTitle) return workspace;
  const priorTitle = column.title;
  return {
    ...workspace,
    columns: workspace.columns.map((candidate) => ({
      ...candidate,
      title: candidate.id === columnId ? nextTitle : candidate.title,
      outputFields: candidate.outputFields?.map((field) =>
        field.id === columnId ? { ...field, title: nextTitle } : field,
      ),
      waterfallSteps: candidate.waterfallSteps?.map((step) =>
        step.field === columnId && step.label === priorTitle
          ? { ...step, label: nextTitle }
          : step,
      ),
    })),
    updatedAt: now,
  };
}
