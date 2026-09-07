import type { ActionReceipt, RunReceipt } from './pomade-types';

export type ProviderPerformance = {
  connectionId: string;
  label: string;
  lookups: number;
  verifications: number;
  accepted: number;
  fallbackMatches: number;
  rejected: number;
  waiting: number;
  errors: number;
  httpRequests: number;
  resultChecks: number;
  reusedSteps: number;
  observedCredits: number;
  unknownCostOperations: number;
  averageResultMs: number | null;
};
export function summarizeProviderPerformance(runs: RunReceipt[]) {
  type Operation = { latest: ActionReceipt; credits?: number; actual: boolean };
  const operations = new Map<string, Operation>();
  const rows = new Map<string, ProviderPerformance & { elapsed: number[] }>();
  let legacyActions = 0;
  const receipts = [...runs]
    .sort((a, b) => a.finishedAt - b.finishedAt)
    .flatMap((run) =>
      run.receipts.flatMap((receipt) => receipt.attempts ?? [receipt]),
    );
  for (const receipt of receipts) {
    if (
      !receipt.operationId ||
      !receipt.providerConnectionId ||
      !receipt.operationRole
    ) {
      if (receipt.provider === 'http') legacyActions++;
      continue;
    }
    const id = receipt.providerConnectionId;
    if (!rows.has(id))
      rows.set(id, {
        connectionId: id,
        label: receipt.providerLabel ?? id,
        lookups: 0,
        verifications: 0,
        accepted: 0,
        fallbackMatches: 0,
        rejected: 0,
        waiting: 0,
        errors: 0,
        httpRequests: 0,
        resultChecks: 0,
        reusedSteps: 0,
        observedCredits: 0,
        unknownCostOperations: 0,
        averageResultMs: null,
        elapsed: [],
      });
    const row = rows.get(id)!;
    row.httpRequests += receipt.httpRequestCount ?? 0;
    if (receipt.operationPhase === 'result-check')
      row.resultChecks += receipt.httpRequestCount ?? 0;
    if (receipt.cached) row.reusedSteps++;
    const previous = operations.get(receipt.operationId);
    const operation = previous ?? { latest: receipt, actual: false };
    operation.latest = receipt;
    operation.actual ||= !receipt.cached;
    if (
      receipt.creditsReported &&
      typeof receipt.reportedCreditTotal === 'number'
    )
      operation.credits = Math.max(
        operation.credits ?? 0,
        receipt.reportedCreditTotal,
      );
    else if (
      !receipt.cached &&
      receipt.creditsReported &&
      typeof receipt.creditsConsumed === 'number'
    )
      operation.credits = (operation.credits ?? 0) + receipt.creditsConsumed;
    operations.set(receipt.operationId, operation);
  }
  for (const { latest: receipt, credits, actual } of operations.values()) {
    if (!actual) continue; // Reuse-only history does not represent another lookup.
    const row = rows.get(receipt.providerConnectionId!)!;
    if (receipt.operationRole === 'lookup') {
      row.lookups++;
      if (receipt.outcome === 'accepted') {
        row.accepted++;
        if ((receipt.waterfallStep ?? 0) > 0) row.fallbackMatches++;
      }
    } else row.verifications++;
    if (receipt.outcome === 'rejected') row.rejected++;
    if (receipt.outcome === 'pending') row.waiting++;
    if (receipt.outcome === 'error') row.errors++;
    if (credits === undefined) row.unknownCostOperations++;
    else row.observedCredits += credits;
    if (
      receipt.finishedAt !== undefined &&
      receipt.startedAt !== undefined &&
      !receipt.pending
    )
      row.elapsed.push(Math.max(0, receipt.finishedAt - receipt.startedAt));
  }
  return {
    providers: [...rows.values()]
      .map(({ elapsed, ...row }) => ({
        ...row,
        averageResultMs: elapsed.length
          ? Math.round(elapsed.reduce((n, ms) => n + ms, 0) / elapsed.length)
          : null,
      }))
      .sort(
        (a, b) => b.accepted - a.accepted || a.label.localeCompare(b.label),
      ),
    legacyActions,
    runCount: runs.length,
  };
}
