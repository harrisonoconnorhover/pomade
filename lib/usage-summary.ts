import type { ActionReceipt, RunReceipt } from './pomade-types';

export type RecentUsageSummary = {
  runCount: number;
  actionCount: number;
  localActionCount: number;
  providerActionCount: number;
  cachedProviderActionCount: number;
  observedCredits: number;
  unreportedProviderActionCount: number;
  providerActions: Partial<Record<'apollo' | 'gemini' | 'parallel', number>>;
};

function isProviderAction(receipt: ActionReceipt) {
  return (
    receipt.provider === 'apollo' ||
    receipt.provider === 'gemini' ||
    receipt.provider === 'parallel'
  );
}

export function summarizeRecentUsage(
  runs: RunReceipt[],
): RecentUsageSummary {
  const receipts = runs.flatMap((run) => run.receipts);
  const providerReceipts = receipts.filter(isProviderAction);
  const providerActions: RecentUsageSummary['providerActions'] = {};
  for (const receipt of providerReceipts) {
    const provider = receipt.provider as 'apollo' | 'gemini' | 'parallel';
    providerActions[provider] = (providerActions[provider] ?? 0) + 1;
  }
  return {
    runCount: runs.length,
    actionCount: receipts.length,
    localActionCount: receipts.length - providerReceipts.length,
    providerActionCount: providerReceipts.length,
    cachedProviderActionCount: providerReceipts.filter(
      (receipt) => receipt.cached,
    ).length,
    observedCredits: providerReceipts.reduce(
      (total, receipt) =>
        total +
        (typeof receipt.creditsConsumed === 'number'
          ? receipt.creditsConsumed
          : 0),
      0,
    ),
    unreportedProviderActionCount: providerReceipts.filter(
      (receipt) =>
        !receipt.cached && typeof receipt.creditsConsumed !== 'number',
    ).length,
    providerActions,
  };
}
