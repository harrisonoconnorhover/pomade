'use client';
import { useEffect, useMemo, useState } from 'react';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';
import type { HttpConnectionSummary } from '@/lib/http-enrichment';
import type { ResearchProviderStatus } from './research-connection-status';
import { previewRun } from '@/lib/run-preview';
const labels = {
  ready: 'Ready now',
  dependent: 'After earlier step',
  setup: 'Needs setup',
  input: 'Missing input',
  skipped: 'Skipped',
};
export default function RunPreview({
  workspace,
  rowIds,
  columnIds,
  research,
}: {
  workspace: WorkspaceSnapshot;
  rowIds: string[];
  columnIds: string[];
  research?: ResearchProviderStatus;
}) {
  const [http, setHttp] = useState<HttpConnectionSummary[]>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/providers/http', { signal: controller.signal })
      .then(async (r) => {
        const data = (await r.json()) as {
          connections?: HttpConnectionSummary[];
        };
        if (!r.ok || !Array.isArray(data.connections))
          throw new Error('Could not check provider connections.');
        if (!controller.signal.aborted) setHttp(data.connections);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [revision]);
  const entries = useMemo(
    () => previewRun(workspace, rowIds, columnIds, { http, research }),
    [workspace, rowIds, columnIds, http, research],
  );
  const needsAttention = entries.filter(
    (e) => e.state === 'setup' || e.state === 'input',
  ).length;
  return (
    <section className="run-preview" aria-label="Run preview">
      <div className="run-preview-heading">
        <div>
          <strong>Before this run</strong>
          <p>
            {needsAttention
              ? `${needsAttention} actions need attention. A missing fallback may matter only if earlier providers miss.`
              : 'Review row inputs and the order providers may run.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setHttp(undefined);
            setError('');
            setRevision((v) => v + 1);
          }}
        >
          Recheck connections
        </button>
      </div>
      {!http && <output>{error || 'Checking provider connections…'}</output>}
      <div className="run-preview-scroll">
        <table>
          <thead>
            <tr>
              <th>Row / action</th>
              <th>Readiness</th>
              <th>Provider order</th>
              <th>Up to</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 80).map((e) => (
              <tr key={`${e.rowId}:${e.columnId}`}>
                <td>
                  <strong>{e.rowLabel}</strong>
                  <small>{e.columnLabel}</small>
                </td>
                <td>
                  <span className={`run-preview-state state-${e.state}`}>
                    {labels[e.state]}
                  </span>
                  {e.details.map((d, i) => (
                    <small key={i}>{d}</small>
                  ))}
                </td>
                <td>{e.steps.join(' → ')}</td>
                <td>{e.maximum}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="run-preview-note">
        {entries.length > 80 ? `Showing 80 of ${entries.length} actions. ` : ''}
        Maximums include conditional fallbacks and verification. Actual requests
        may be fewer. Result checks are separate; provider credit costs may be
        unknown. Readiness checks saved settings, not live account entitlements.
      </p>
    </section>
  );
}
