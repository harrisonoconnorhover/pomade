import { describe, expect, it } from 'vitest';

import type { ActionReceipt, RunReceipt } from './pomade-types';
import { summarizeRecentUsage } from './usage-summary';

function receipt(
  id: string,
  patch: Partial<ActionReceipt> = {},
): ActionReceipt {
  return {
    id,
    rowId: 'row-1',
    rowLabel: 'Acme',
    columnId: 'field',
    action: 'Action',
    status: 'passed',
    durationMs: 10,
    before: '',
    after: 'value',
    ...patch,
  };
}

function run(receipts: ActionReceipt[]): RunReceipt {
  return {
    id: 'run-1',
    workspaceId: 'workspace-1',
    status: 'completed',
    startedAt: 1,
    finishedAt: 2,
    rowCount: 1,
    actionCount: receipts.length,
    passedCount: receipts.length,
    reviewCount: 0,
    externalWrites: 0,
    receipts,
  };
}

describe('recent usage summary', () => {
  it('separates local, cached, observed-credit, and unreported actions', () => {
    const summary = summarizeRecentUsage([
      run([
        receipt('local'),
        receipt('apollo', {
          provider: 'apollo',
          creditsConsumed: 1,
          cached: false,
        }),
        receipt('cached', {
          provider: 'apollo',
          creditsConsumed: 0,
          cached: true,
        }),
        receipt('research', {
          provider: 'parallel',
          cached: false,
        }),
      ]),
    ]);

    expect(summary).toEqual({
      runCount: 1,
      actionCount: 4,
      localActionCount: 1,
      providerActionCount: 3,
      cachedProviderActionCount: 1,
      observedCredits: 1,
      unreportedProviderActionCount: 1,
      providerActions: { apollo: 2, parallel: 1 },
    });
  });

  it('returns zeros for an empty history', () => {
    expect(summarizeRecentUsage([])).toMatchObject({
      runCount: 0,
      actionCount: 0,
      providerActionCount: 0,
      observedCredits: 0,
      unreportedProviderActionCount: 0,
      providerActions: {},
    });
  });
});
