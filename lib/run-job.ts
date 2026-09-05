import type { RunJob } from './pomade-types';

export const MAX_BACKGROUND_ROWS = 100;
export const MAX_BACKGROUND_RESEARCH_ACTIONS = 50;
export const RUN_JOB_LEASE_MS = 15 * 60 * 1_000;

export function createRunJob(input: {
  id: string;
  workspaceId: string;
  rowIds: string[];
  columnIds?: string[];
  confirmExternalResearch: boolean;
  now?: number;
}): RunJob {
  const rowIds = Array.from(new Set(input.rowIds)).filter(Boolean);
  const columnIds = Array.from(new Set(input.columnIds ?? [])).filter(Boolean);
  if (!rowIds.length || rowIds.length > MAX_BACKGROUND_ROWS) {
    throw new Error(
      `Background runs require between 1 and ${MAX_BACKGROUND_ROWS} rows.`,
    );
  }
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    status: 'queued',
    rowIds,
    columnIds: columnIds.length ? columnIds : undefined,
    cursor: 0,
    completedCount: 0,
    skippedCount: 0,
    confirmExternalResearch: input.confirmExternalResearch,
    createdAt: now,
    updatedAt: now,
  };
}

export function runJobPercent(job: RunJob) {
  if (!job.rowIds.length) return 100;
  return Math.min(100, Math.round((job.cursor / job.rowIds.length) * 100));
}

export function canPauseRunJob(job: RunJob) {
  return job.status === 'queued' || job.status === 'running';
}

export function canResumeRunJob(job: RunJob) {
  return job.status === 'paused' || job.status === 'failed';
}
