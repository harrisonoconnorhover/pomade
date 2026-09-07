'use client';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import type { ProviderAccount } from '@/lib/provider-accounts';
export default function ProviderAccounts({ active }: { active: boolean }) {
  const [accounts, setAccounts] = useState<ProviderAccount[]>(),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [loadedRevision, setLoadedRevision] = useState(-1);
  const loading = loadedRevision !== revision;
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    fetch('/api/providers/accounts')
      .then(async (r) => {
        if (!r.ok) throw new Error('Provider balances could not be loaded.');
        const data = (await r.json()) as { accounts: ProviderAccount[] };
        if (!cancelled) {
          setAccounts(data.accounts);
          setError('');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoadedRevision(revision);
      });
    return () => {
      cancelled = true;
    };
  }, [active, revision]);
  return (
    <details className="provider-allowances">
      <summary>Connected providers and allowances</summary>
      <div className="provider-account-grid">
        {accounts?.map((a) => (
          <article key={a.id}>
            <div>
              <strong>{a.name}</strong>
              <span className={`provider-connection-${a.status}`}>
                {a.status === 'ready'
                  ? (a.plan ?? 'Connected')
                  : a.status === 'configured'
                    ? 'Key connected'
                    : a.status === 'unavailable'
                      ? 'Check connection'
                      : 'Not connected'}
              </span>
            </div>
            <b>
              {a.remaining === undefined
                ? 'Balance not reported'
                : `${a.remaining} ${a.unit ?? 'credits'} left`}
            </b>
            <p>{a.note}</p>
            {a.resetsAt ? (
              <small>Renews {a.resetsAt.slice(0, 10)}</small>
            ) : null}
            <a href={a.dashboard} target="_blank" rel="noreferrer">
              Open {a.name}
            </a>
          </article>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={() => setRevision((r) => r + 1)}
      >
        {loading ? 'Checking balances…' : 'Refresh balances'}
      </Button>
    </details>
  );
}
