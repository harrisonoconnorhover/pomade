import type { PomadeColumn } from './pomade-types';
import type { WaterfallProgress } from '../db/waterfall-progress';

export const ASYNC_PROVIDER_CONNECTIONS = [
  'pomade_enrow',
  'pomade_fullenrich',
  'pomade_dropcontact',
  'pomade_apollo_phone',
];
export function hasAsyncProvider(column: PomadeColumn) {
  return (
    column.providerWaterfall?.steps.some(
      (step) =>
        ASYNC_PROVIDER_CONNECTIONS.includes(step.connectionId) ||
        step.verifier?.presetId === 'enrow-verify',
    ) ?? false
  );
}
export type AsyncProviderRequest = {
  phase: 'submitting' | 'waiting';
  requestId?: string;
  correlationId?: string;
  personId?: string;
  terminalError?: string;
  submittedAt: number;
  nextPollAt: number;
  pollCount: number;
  waitUntil?: number;
  reportedCredits?: number;
};
export type AsyncProviderContext = {
  progress: WaterfallProgress;
  index: number | string;
};
export class ProviderPendingError extends Error {
  constructor(
    message: string,
    public credits: number | null = 0,
  ) {
    super(message);
  }
}
export class ProviderSubmissionUnknownError extends Error {
  constructor(provider: string) {
    super(
      `${provider} may have accepted this lookup, but no request ID was saved. Automatic resubmission is blocked. Check ${provider}’s request history before starting a new run.`,
    );
  }
}
export class ProviderResultError extends Error {
  constructor(
    message: string,
    public credits: number | null = 0,
  ) {
    super(message);
  }
}
