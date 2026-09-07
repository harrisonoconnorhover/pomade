import { runJobLocksWorkspace } from './run-job';
import { describe, expect, it } from 'vitest';

import {
  canPauseRunJob,
  canResumeRunJob,
  createRunJob,
  runJobPercent,
} from './run-job';

describe('background run jobs', () => {
  it('creates a deduplicated queued job with stable row scope', () => {
    const job = createRunJob({
      id: 'job-1',
      workspaceId: 'workspace-1',
      rowIds: ['row-1', 'row-1', 'row-2'],
      columnIds: ['fit', 'fit'],
      confirmExternalResearch: false,
      now: 1_000,
    });

    expect(job).toMatchObject({
      status: 'queued',
      rowIds: ['row-1', 'row-2'],
      columnIds: ['fit'],
      cursor: 0,
      completedCount: 0,
    });
    expect(runJobPercent({ ...job, cursor: 1 })).toBe(50);
  });

  it('exposes valid pause and resume transitions', () => {
    const job = createRunJob({
      id: 'job-1',
      workspaceId: 'workspace-1',
      rowIds: ['row-1'],
      confirmExternalResearch: true,
    });

    expect(canPauseRunJob(job)).toBe(true);
    expect(canResumeRunJob(job)).toBe(false);
    expect(canPauseRunJob({ ...job, status: 'paused' })).toBe(false);
    expect(canResumeRunJob({ ...job, status: 'paused' })).toBe(true);
    expect(canResumeRunJob({ ...job, status: 'failed' })).toBe(true);
  });

  it('rejects an empty or oversized scope', () => {
    expect(() =>
      createRunJob({
        id: 'job-1',
        workspaceId: 'workspace-1',
        rowIds: [],
        confirmExternalResearch: false,
      }),
    ).toThrow('between 1 and 100 rows');
    expect(() =>
      createRunJob({
        id: 'job-2',
        workspaceId: 'workspace-1',
        rowIds: Array.from({ length: 101 }, (_, index) => `row-${index}`),
        confirmExternalResearch: false,
      }),
    ).toThrow('between 1 and 100 rows');
  });
});

it('unlocks an interrupted paused run after its lease expires', () => {
  const job = createRunJob({
    id: 'lease',
    workspaceId: 'w',
    rowIds: ['a'],
    confirmExternalResearch: false,
    now: 1,
  });
  expect(
    runJobLocksWorkspace({ ...job, status: 'paused', leaseUntil: 200 }, 100),
  ).toBe(true);
  expect(
    runJobLocksWorkspace({ ...job, status: 'paused', leaseUntil: 200 }, 201),
  ).toBe(false);
  expect(runJobLocksWorkspace(job, 201)).toBe(true);
});
