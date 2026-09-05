import { functionStepIds } from './recipe-functions';
import type {
  RecipeSchedule,
  TableTransferRule,
  RecipeScheduleCadence,
  RunReceipt,
  WorkspaceSnapshot,
} from './pomade-types';

const DAY_MS = 24 * 60 * 60 * 1_000;
const WEEK_MS = 7 * DAY_MS;
const SCHEDULE_LEASE_MS = 15 * 60 * 1_000;

function cadenceInterval(cadence: RecipeScheduleCadence) {
  if (cadence === 'every_day') return DAY_MS;
  if (cadence === 'every_week') return WEEK_MS;
  return 0;
}

export function createRecipeSchedule(input: {
  id: string;
  cadence: RecipeScheduleCadence;
  nextRunAt: number;
  rowIds?: string[];
  functionInstanceId?: string;
  afterRunTransfer?: TableTransferRule;
  afterRunTransfers?: TableTransferRule[];
  beforeRunSource?: import('./api-source').ApiSourceRefresh;
  now?: number;
}): RecipeSchedule {
  const now = input.now ?? Date.now();
  if (
    input.afterRunTransfers &&
    (input.afterRunTransfers.length > 5 ||
      new Set(input.afterRunTransfers.map((r) => r.targetTableId)).size !==
        input.afterRunTransfers.length)
  )
    throw new Error('Choose up to five transfers with distinct destinations.');
  if (!Number.isFinite(input.nextRunAt) || input.nextRunAt <= now) {
    throw new Error('Choose a future date and time.');
  }
  const rowIds = Array.from(new Set(input.rowIds ?? [])).filter(Boolean);
  return {
    id: input.id,
    functionInstanceId: input.functionInstanceId || undefined,
    afterRunTransfer: input.afterRunTransfer
      ? structuredClone(input.afterRunTransfer)
      : undefined,
    afterRunTransfers: input.afterRunTransfers
      ? structuredClone(input.afterRunTransfers)
      : undefined,
    lastTransferRunIds: undefined,
    lastTransferRunId: undefined,
    beforeRunSource: input.beforeRunSource
      ? structuredClone(input.beforeRunSource)
      : undefined,
    lastSourceBatchId: undefined,
    cadence: input.cadence,
    enabled: true,
    nextRunAt: input.nextRunAt,
    target: rowIds.length ? 'selected' : 'all',
    rowIds: rowIds.length ? rowIds : undefined,
    confirmExternalResearch: true,
    state: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function isScheduleDue(
  schedule: RecipeSchedule | undefined,
  now = Date.now(),
) {
  return Boolean(
    (schedule?.enabled &&
      schedule.state === 'active' &&
      schedule.nextRunAt !== undefined &&
      schedule.nextRunAt <= now) ||
    (schedule?.state === 'running' &&
      schedule.leaseUntil !== undefined &&
      schedule.leaseUntil <= now),
  );
}

function nextRecurringRun(schedule: RecipeSchedule, now: number) {
  const interval = cadenceInterval(schedule.cadence);
  if (!interval || schedule.nextRunAt === undefined) return undefined;
  const missedIntervals = Math.floor((now - schedule.nextRunAt) / interval) + 1;
  return schedule.nextRunAt + Math.max(1, missedIntervals) * interval;
}

export function claimDueSchedule(
  workspace: WorkspaceSnapshot,
  now = Date.now(),
): WorkspaceSnapshot | null {
  const schedule = workspace.schedule;
  if (!isScheduleDue(schedule, now) || !schedule) return null;
  const recoveringExpiredClaim = schedule.state === 'running';
  const nextRunAt = recoveringExpiredClaim
    ? schedule.nextRunAt
    : nextRecurringRun(schedule, now);
  return {
    ...workspace,
    schedule: {
      ...schedule,
      enabled: recoveringExpiredClaim
        ? schedule.enabled
        : schedule.cadence !== 'once',
      nextRunAt,
      state: 'running',
      lastAttemptAt: now,
      leaseUntil: now + SCHEDULE_LEASE_MS,
      lastError: undefined,
      updatedAt: now,
    },
    updatedAt: now,
  };
}

export function completeClaimedSchedule(
  workspace: WorkspaceSnapshot,
  run: RunReceipt,
  now = Date.now(),
): WorkspaceSnapshot {
  const schedule = workspace.schedule;
  if (!schedule) return workspace;
  const recurring = schedule.cadence !== 'once';
  return {
    ...workspace,
    schedule: {
      ...schedule,
      enabled: recurring,
      state: recurring ? 'active' : 'complete',
      lastRunAt: now,
      lastRunId: run.id,
      lastError: undefined,
      leaseUntil: undefined,
      updatedAt: now,
    },
    updatedAt: now,
  };
}

export function failClaimedSchedule(
  workspace: WorkspaceSnapshot,
  error: string,
  now = Date.now(),
): WorkspaceSnapshot {
  const schedule = workspace.schedule;
  if (!schedule) return workspace;
  return {
    ...workspace,
    schedule: {
      ...schedule,
      enabled: false,
      state: 'failed',
      lastError: error.replace(/\s+/g, ' ').trim().slice(0, 500),
      leaseUntil: undefined,
      updatedAt: now,
    },
    updatedAt: now,
  };
}

export function pauseRecipeSchedule(
  schedule: RecipeSchedule,
  now = Date.now(),
): RecipeSchedule {
  return {
    ...schedule,
    enabled: false,
    state: 'paused',
    leaseUntil: undefined,
    updatedAt: now,
  };
}

export function scheduledColumnIds(workspace: WorkspaceSnapshot) {
  const id = workspace.schedule?.functionInstanceId;
  return id ? functionStepIds(workspace.columns, id) : undefined;
}

export function scheduledTransfers(schedule: RecipeSchedule | undefined) {
  return (
    schedule?.afterRunTransfers ??
    (schedule?.afterRunTransfer ? [schedule.afterRunTransfer] : [])
  );
}
