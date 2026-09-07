import { describe, expect, it } from 'vitest';
import { summarizeProviderPerformance } from './provider-performance';
import type { ActionReceipt, RunReceipt } from './pomade-types';
const receipt = (patch: Partial<ActionReceipt> = {}): ActionReceipt => ({
  id: crypto.randomUUID(),
  rowId: 'row',
  rowLabel: 'Row',
  columnId: 'contact',
  action: 'Lookup',
  status: 'passed',
  before: '',
  after: 'ada@example.test',
  durationMs: 10,
  provider: 'http',
  providerConnectionId: 'finder',
  providerLabel: 'Finder',
  operationId: 'job:row:column:0',
  operationRole: 'lookup',
  operationPhase: 'request',
  outcome: 'accepted',
  waterfallStep: 0,
  httpRequestCount: 1,
  startedAt: 100,
  finishedAt: 200,
  ...patch,
});
const run = (at: number, attempts: ActionReceipt[]): RunReceipt => ({
  id: 'run-' + at,
  workspaceId: 'table',
  status: 'completed',
  startedAt: at,
  finishedAt: at,
  rowCount: 1,
  actionCount: 1,
  passedCount: 1,
  reviewCount: 0,
  externalWrites: 0,
  receipts: [{ ...receipt(), attempts }],
});
describe('provider performance from recorded operations', () => {
  it('counts one accepted lookup across submission, polling and cached reuse; credits do not double-count', () => {
    const result = summarizeProviderPerformance([
      run(500, [
        receipt({
          cached: true,
          httpRequestCount: 0,
          creditsConsumed: 0,
          creditsReported: true,
          reportedCreditTotal: 2,
          finishedAt: 400,
        }),
      ]),
      run(200, [
        receipt({
          pending: true,
          outcome: 'pending',
          operationPhase: 'submission',
          finishedAt: undefined,
          creditsConsumed: null,
        }),
      ]),
      run(400, [
        receipt({
          operationPhase: 'result-check',
          creditsReported: true,
          reportedCreditTotal: 2,
          creditsConsumed: 2,
          finishedAt: 400,
        }),
      ]),
    ]);
    expect(result.providers[0]).toMatchObject({
      lookups: 1,
      accepted: 1,
      waiting: 0,
      httpRequests: 2,
      resultChecks: 1,
      reusedSteps: 1,
      observedCredits: 2,
      unknownCostOperations: 0,
      averageResultMs: 300,
    });
  });
  it('records verifier rejection separately and attributes extra matches to the fallback finder', () => {
    const result = summarizeProviderPerformance([
      run(300, [
        receipt({ outcome: 'rejected' }),
        receipt({
          operationId: 'verify0',
          providerConnectionId: 'verifier',
          operationRole: 'verification',
          outcome: 'rejected',
          creditsReported: true,
          creditsConsumed: 0.25,
        }),
        receipt({
          operationId: 'lookup1',
          providerConnectionId: 'next',
          waterfallStep: 1,
          creditsReported: true,
          creditsConsumed: 1,
        }),
      ]),
    ]);
    expect(
      result.providers.find((p) => p.connectionId === 'finder'),
    ).toMatchObject({ accepted: 0, rejected: 1, unknownCostOperations: 1 });
    expect(
      result.providers.find((p) => p.connectionId === 'verifier'),
    ).toMatchObject({
      lookups: 0,
      verifications: 1,
      accepted: 0,
      rejected: 1,
      observedCredits: 0.25,
    });
    expect(
      result.providers.find((p) => p.connectionId === 'next'),
    ).toMatchObject({ lookups: 1, accepted: 1, fallbackMatches: 1 });
  });
  it('shows pending/error outcomes and does not call unknown cost free', () => {
    const result = summarizeProviderPerformance([
      run(300, [
        receipt({
          outcome: 'pending',
          pending: true,
          finishedAt: undefined,
          creditsConsumed: 0,
          creditsReported: false,
        }),
        receipt({ operationId: 'other', outcome: 'error', error: 'HTTP 429' }),
      ]),
    ]);
    expect(result.providers[0]).toMatchObject({
      lookups: 2,
      waiting: 1,
      errors: 1,
      unknownCostOperations: 2,
      observedCredits: 0,
      averageResultMs: 100,
    });
  });
  it('keeps reuse-only receipts and unattributed old runs out of new match counts', () => {
    const result = summarizeProviderPerformance([
      run(300, [
        receipt({ cached: true, httpRequestCount: 0 }),
        receipt({ operationId: undefined }),
      ]),
    ]);
    expect(result.providers[0]).toMatchObject({
      lookups: 0,
      accepted: 0,
      reusedSteps: 1,
    });
    expect(result.legacyActions).toBe(1);
  });
});
