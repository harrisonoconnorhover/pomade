import { describe, expect, it } from 'vitest';

import type { RunReceipt, WorkspaceSnapshot } from './pomade-types';
import {
  claimDueSchedule,
  completeClaimedSchedule,
  createRecipeSchedule,
  failClaimedSchedule,
  isScheduleDue,
  pauseRecipeSchedule,
} from './recipe-schedule';
import { createSampleWorkspace } from './sample-workspace';

function scheduledWorkspace(
  nextRunAt: number,
  cadence: 'once' | 'every_day' | 'every_week' = 'once',
) {
  const workspace = createSampleWorkspace();
  workspace.schedule = createRecipeSchedule({
    id: 'schedule-1',
    cadence,
    nextRunAt,
    now: 1_000,
  });
  return workspace;
}

const run: RunReceipt = {
  id: 'run-1',
  workspaceId: 'founder-targets',
  status: 'completed',
  startedAt: 2_000,
  finishedAt: 2_100,
  rowCount: 10,
  actionCount: 20,
  passedCount: 20,
  reviewCount: 0,
  externalWrites: 0,
  receipts: [],
};

describe('recipe schedules', () => {
  it('creates a future all-row schedule with explicit provider consent', () => {
    expect(
      createRecipeSchedule({
        id: 'schedule-1',
        cadence: 'once',
        nextRunAt: 5_000,
        now: 1_000,
      }),
    ).toMatchObject({
      enabled: true,
      target: 'all',
      state: 'active',
      confirmExternalResearch: true,
    });
    expect(() =>
      createRecipeSchedule({
        id: 'schedule-1',
        cadence: 'once',
        nextRunAt: 999,
        now: 1_000,
      }),
    ).toThrow('Choose a future date and time.');
  });

  it('deduplicates captured row IDs', () => {
    const schedule = createRecipeSchedule({
      id: 'schedule-1',
      cadence: 'once',
      nextRunAt: 5_000,
      rowIds: ['row-1', 'row-1', 'row-2'],
      now: 1_000,
    });

    expect(schedule).toMatchObject({
      target: 'selected',
      rowIds: ['row-1', 'row-2'],
    });
  });

  it('claims a due one-time schedule exactly once', () => {
    const workspace = scheduledWorkspace(2_000);
    const claimed = claimDueSchedule(workspace, 2_000);

    expect(claimed?.schedule).toMatchObject({
      enabled: false,
      state: 'running',
      lastAttemptAt: 2_000,
      leaseUntil: 902_000,
    });
    expect(claimed?.schedule?.nextRunAt).toBeUndefined();
    expect(isScheduleDue(claimed?.schedule, 2_001)).toBe(false);
  });

  it('advances recurring schedules past missed intervals before execution', () => {
    const day = 24 * 60 * 60 * 1_000;
    const workspace = scheduledWorkspace(2_000, 'every_day');
    const claimed = claimDueSchedule(workspace, 2_000 + day * 2 + 50);

    expect(claimed?.schedule).toMatchObject({
      enabled: true,
      state: 'running',
      nextRunAt: 2_000 + day * 3,
    });
  });

  it('reclaims an expired running schedule without advancing twice', () => {
    const day = 24 * 60 * 60 * 1_000;
    const claimed = claimDueSchedule(
      scheduledWorkspace(2_000, 'every_day'),
      2_000,
    )!;
    const reclaimed = claimDueSchedule(claimed, 2_000 + 15 * 60 * 1_000);

    expect(reclaimed?.schedule).toMatchObject({
      state: 'running',
      nextRunAt: 2_000 + day,
      lastAttemptAt: 902_000,
    });
  });

  it('records success and stops a failed schedule safely', () => {
    const claimed = claimDueSchedule(scheduledWorkspace(2_000), 2_000);
    const completed = completeClaimedSchedule(
      claimed as WorkspaceSnapshot,
      run,
      2_100,
    );

    expect(completed.schedule).toMatchObject({
      enabled: false,
      state: 'complete',
      lastRunAt: 2_100,
      lastRunId: 'run-1',
    });

    const failed = failClaimedSchedule(
      claimed as WorkspaceSnapshot,
      'Provider unavailable\nretry later',
      2_100,
    );
    expect(failed.schedule).toMatchObject({
      enabled: false,
      state: 'failed',
      lastError: 'Provider unavailable retry later',
    });
  });

  it('pauses an active schedule without erasing its next time', () => {
    const schedule = scheduledWorkspace(5_000).schedule!;

    expect(pauseRecipeSchedule(schedule, 2_000)).toMatchObject({
      enabled: false,
      state: 'paused',
      nextRunAt: 5_000,
      updatedAt: 2_000,
    });
  });
});
