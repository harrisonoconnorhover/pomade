'use client';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Globe2,
  MailCheck,
  Phone,
  Search,
} from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import {
  catalogConnectionStatus,
  searchProviderCatalog,
  type CatalogAction,
  type CatalogCategory,
  type CatalogConnections,
} from '@/lib/provider-catalog';
const categories = [
  { id: 'all', label: 'All providers' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'company', label: 'Company' },
  { id: 'research', label: 'Research' },
] as const;
const icons = {
  email: MailCheck,
  phone: Phone,
  company: Building2,
  research: Globe2,
};
export default function ProviderCatalog({
  initialCategory,
  onClose,
  onSelect,
  onWaterfall,
}: {
  initialCategory: CatalogCategory;
  onClose: () => void;
  onSelect: (action: CatalogAction) => void;
  onWaterfall: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    revision: number;
    connections: CatalogConnections;
    error: boolean;
  }>();
  const loading = result?.revision !== revision;
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const read = async <T,>(url: string): Promise<T> => {
      const r = await fetch(url, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(20_000),
        ]),
      });
      if (!r.ok) throw new Error('Connection check failed');
      return r.json() as Promise<T>;
    };
    void Promise.allSettled([
      read<{ connections?: { id: string }[] }>('/api/providers/http'),
      read<NonNullable<CatalogConnections['research']>>(
        '/api/providers/research',
      ),
    ]).then(([http, research]) => {
      if (cancelled) return;
      const httpData =
        http.status === 'fulfilled' && Array.isArray(http.value.connections)
          ? http.value.connections.map((c: { id: string }) => c.id)
          : undefined;
      const researchData =
        research.status === 'fulfilled' &&
        typeof research.value.configured === 'boolean'
          ? research.value
          : undefined;
      setResult({
        revision,
        connections: { http: httpData, research: researchData },
        error: !httpData || !researchData,
      });
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [revision]);
  const matches = searchProviderCatalog(query, category);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="provider-catalog-dialog">
        <DialogHeader>
          <DialogTitle>Find an enrichment or research action</DialogTitle>
          <DialogDescription>
            Choose what you need, check its inputs, then configure your column.
            Nothing runs until you start it.
          </DialogDescription>
        </DialogHeader>
        <label className="catalog-search">
          <Search aria-hidden="true" />
          <input
            aria-label="Search providers and actions"
            placeholder="Try Apollo, mobile, email verification…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="catalog-categories" aria-label="Filter by task">
          {categories.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={category === item.id ? 'default' : 'outline'}
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="catalog-list-heading">
          <span aria-live="polite">{matches.length} actions</span>
          {result?.error && !loading ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRevision((r) => r + 1)}
            >
              Retry connection check
            </Button>
          ) : (
            <small>
              {loading
                ? 'Checking your connections…'
                : 'Using your account connections'}
            </small>
          )}
        </div>
        <div className="provider-catalog-list">
          {matches.map((action) => {
            const status = catalogConnectionStatus(
              action,
              result?.connections ?? {},
            );
            const Icon = icons[action.category];
            return (
              <button
                className="provider-catalog-card"
                key={action.id}
                type="button"
                onClick={() => onSelect(action)}
              >
                <span className="catalog-provider-icon">
                  <Icon aria-hidden="true" />
                </span>
                <span className="catalog-action-detail">
                  <strong>{action.label}</strong>
                  <small>Needs: {action.inputs.join(' + ')}</small>
                  <span
                    className="catalog-connection"
                    data-configured={!loading && status.configured}
                  >
                    {loading ? 'Checking connection…' : status.label}
                  </span>
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
            );
          })}
          {!matches.length ? (
            <div className="catalog-empty">
              <strong>No matching actions</strong>
              <p>Try another provider name or choose All providers.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>
        <div className="catalog-footer">
          <small>
            Configured keys may still require provider plan access. Setup can be
            saved before connecting.
          </small>
          <Button variant="outline" onClick={onWaterfall}>
            Build a custom waterfall
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
