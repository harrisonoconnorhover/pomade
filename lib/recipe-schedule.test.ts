import { describe, expect, it } from 'vitest';

import type { RunReceipt, WorkspaceSnapshot } from './pomade-types';
import {
  scheduledTransfers,
  scheduledColumnIds,
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

describe('scheduled workflows', () => {
  it('captures transfer settings independently and retains them across claims', () => {
    const transfer = {
      id: 't',
      name: 'Send',
      targetTableId: 'dest',
      sourceKey: 'domain',
      targetKey: 'domain',
      mode: 'upsert' as const,
      normalization: 'domain' as const,
      mapping: { company: 'label' },
      skipBlank: true,
    };
    const workspace = createSampleWorkspace();
    workspace.schedule = createRecipeSchedule({
      id: 's',
      cadence: 'every_day',
      nextRunAt: 2000,
      now: 1000,
      functionInstanceId: 'f',
      afterRunTransfer: transfer,
    });
    transfer.mapping.company = 'other';
    const claimed = claimDueSchedule(workspace, 2000)!;
    expect(claimed.schedule?.afterRunTransfer?.mapping.company).toBe('label');
    const completed = completeClaimedSchedule(claimed, run, 2100);
    expect(completed.schedule?.functionInstanceId).toBe('f');
    expect(completed.schedule?.afterRunTransfer?.mapping.company).toBe('label');
  });
  it('resolves only the scheduled function and fails when its group is broken', () => {
    const workspace = scheduledWorkspace(2000);
    expect(scheduledColumnIds(workspace)).toBeUndefined();
    const columns = workspace.columns.filter((c) => c.recipe).slice(0, 2);
    expect(columns).toHaveLength(2);
    columns.forEach((c, step) => {
      c.functionInstance = {
        id: 'f',
        definitionId: 'd',
        name: 'Workflow',
        step,
        total: 2,
      };
    });
    workspace.schedule!.functionInstanceId = 'f';
    expect(scheduledColumnIds(workspace)).toEqual(columns.map((c) => c.id));
    workspace.columns = workspace.columns.filter((c) => c.id !== columns[1].id);
    expect(() => scheduledColumnIds(workspace)).toThrow('removed or reordered');
  });
});

it('captures multiple branches, supports legacy schedules and rejects duplicate destinations', () => {
  const transfer = {
    id: 'one',
    name: 'One',
    targetTableId: 'dest',
    sourceKey: 'domain',
    targetKey: 'domain',
    mode: 'upsert' as const,
    normalization: 'domain' as const,
    mapping: { company: 'company' },
    skipBlank: true,
  };
  const input = {
    id: 's',
    cadence: 'once' as const,
    nextRunAt: 2000,
    now: 1000,
  };
  const legacy = createRecipeSchedule({ ...input, afterRunTransfer: transfer });
  expect(scheduledTransfers(legacy)).toHaveLength(1);
  const branches = [
    transfer,
    { ...transfer, id: 'two', targetTableId: 'other' },
  ];
  const schedule = createRecipeSchedule({
    ...input,
    afterRunTransfers: branches,
  });
  branches[0].mapping.company = 'changed';
  expect(scheduledTransfers(schedule)[0].mapping.company).toBe('company');
  expect(() =>
    createRecipeSchedule({
      ...input,
      afterRunTransfers: [transfer, { ...transfer, id: 'two' }],
    }),
  ).toThrow('distinct destinations');
  expect(scheduledTransfers({ ...legacy, afterRunTransfers: [] })).toEqual([]);
});
