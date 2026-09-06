'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { HubSpotSegment } from '@/lib/pomade-types';

export default function HubSpotSegmentPicker({
  objectType,
  value,
  onChange,
  active,
  disabled,
}: {
  objectType: string;
  value: string;
  onChange: (id: string) => void;
  active: boolean;
  disabled: boolean;
}) {
  const [catalog, setCatalog] = useState<{
    key: string;
    segments: HubSpotSegment[];
    error: string;
  }>();
  const [revision, setRevision] = useState(0);
  const key = `${objectType}:${revision}`;
  const loading = active && catalog?.key !== key;
  const segments = catalog?.key === key ? catalog.segments : [];
  const error = catalog?.key === key ? catalog.error : '';

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/providers/crm/segments?objectType=${encodeURIComponent(objectType)}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as {
          segments?: HubSpotSegment[];
          error?: string;
        };
        if (!response.ok || !result.segments)
          throw new Error(
            result.error || 'HubSpot segments could not be loaded.',
          );
        if (!controller.signal.aborted)
          setCatalog({ key, segments: result.segments, error: '' });
      } catch (failure) {
        if (!controller.signal.aborted)
          setCatalog({
            key,
            segments: [],
            error:
              failure instanceof Error
                ? failure.message
                : 'HubSpot segments could not be loaded.',
          });
      }
    })();
    return () => controller.abort();
  }, [active, objectType, key]);

  return (
    <div className="hubspot-segment-picker">
      <label>
        HubSpot segment
        <select
          aria-label="HubSpot segment"
          value={value}
          disabled={disabled || loading || !active}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">
            {loading ? 'Loading segments…' : 'Choose a segment…'}
          </option>
          <option value="all">
            All {objectType === 'company' ? 'companies' : 'contacts'} (no
            segment)
          </option>
          {segments.map((segment) => (
            <option key={segment.id} value={segment.id}>
              {segment.name} ·{' '}
              {segment.processingType === 'DYNAMIC' ? 'Active' : 'Static'}
              {segment.size === undefined ? '' : ` · ${segment.size} records`}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={disabled || loading || !active}
        onClick={() => {
          onChange('');
          setRevision((v) => v + 1);
        }}
      >
        <RefreshCw className={loading ? 'spin' : ''} /> Refresh segments
      </button>
      {error ? (
        <p className="source-error" role="alert">
          {error}
        </p>
      ) : !loading && active ? (
        <p className="source-help">
          {segments.length
            ? `${segments.length} segments available. Records are fetched only when you preview.`
            : 'No segments for this record type. Create one in HubSpot, then refresh.'}
        </p>
      ) : null}
    </div>
  );
}
