'use client';
import { useEffect, useState } from 'react';
import type { summarizeProviderPerformance } from '@/lib/provider-performance';

type Summary = ReturnType<typeof summarizeProviderPerformance>;
const duration = (ms: number | null) =>
  ms === null
    ? '—'
    : ms < 1000
      ? '<1s'
      : ms < 60_000
        ? `${Math.round(ms / 1000)}s`
        : `${(ms / 60_000).toFixed(1)}m`;
export default function ProviderPerformancePanel({
  workspaceId,
  open,
}: {
  workspaceId: string;
  open: boolean;
}) {
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    fetch(
      '/api/providers/performance?workspaceId=' +
        encodeURIComponent(workspaceId),
      { signal: abort.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            'Provider performance could not be loaded. Reopen Run history to retry.',
          );
        return response.json() as Promise<Summary>;
      })
      .then((result) => {
        if (!abort.signal.aborted) {
          setSummary(result);
          setError('');
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Could not load provider performance.',
          );
      });
    return () => abort.abort();
  }, [workspaceId, open]);
  return (
    <section className="provider-performance" aria-label="Provider performance">
      <h3>Which providers are adding useful matches?</h3>
      <p>
        Up to the latest 100 run receipts for this sheet. Extra matches are
        accepted results found after an earlier provider did not supply an
        acceptable value.
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : !summary ? (
        <output>Loading provider performance…</output>
      ) : !summary.providers.length ? (
        <p>
          Run a provider waterfall to see its performance here. New runs record
          lookups and verification separately.
        </p>
      ) : (
        <div className="provider-performance-scroll">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Lookups / checks</th>
                <th>Accepted</th>
                <th>Extra matches</th>
                <th>Waiting / errors</th>
                <th>Avg result time</th>
                <th>Credits</th>
              </tr>
            </thead>
            <tbody>
              {summary.providers.map((row) => (
                <tr key={row.connectionId}>
                  <th scope="row">
                    {row.label}
                    <small>
                      {row.httpRequests} requests · {row.resultChecks} result
                      checks · {row.reusedSteps} saved steps reused
                    </small>
                  </th>
                  <td>
                    {row.lookups} / {row.verifications}
                  </td>
                  <td>{row.accepted}</td>
                  <td>{row.fallbackMatches}</td>
                  <td>
                    {row.waiting} / {row.errors}
                  </td>
                  <td>{duration(row.averageResultMs)}</td>
                  <td>
                    {row.observedCredits.toLocaleString()}
                    <small>
                      {row.unknownCostOperations
                        ? `${row.unknownCostOperations} costs unknown`
                        : 'Reported by provider'}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Boolean(summary?.legacyActions) && (
        <p>
          {summary!.legacyActions} older or custom HTTP actions lack the
          identifiers needed for this breakdown.
        </p>
      )}
      <p>
        Result time includes waiting. Each vendor defines its own credits; these
        are not dollar costs. Saved checks are grouped with their original
        lookup.
      </p>
    </section>
  );
}
