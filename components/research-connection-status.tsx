'use client';

import { Globe2, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

export type ResearchProviderStatus = {
  provider: 'parallel' | 'gemini' | 'codex' | null;
  configured: boolean;
  ready?: boolean;
  companion?: boolean;
  label: string;
  model: string;
  error?: string;
  capabilities: {
    webResearch: boolean;
    citations: boolean;
    maximumActionsPerRun: number;
    localBrowser?: boolean;
    maximumPagesPerResearch?: number | null;
  };
};

export default function ResearchConnectionStatus({
  status,
  checking,
  onRefresh,
  title,
  detail,
}: {
  status?: ResearchProviderStatus;
  checking: boolean;
  onRefresh: () => void;
  title?: string;
  detail?: string;
}) {
  return (
    <section className="research-connection" aria-label="Research connection">
      <div className="research-provider-state">
        <span className="source-logo source-logo-gemini">
          <Globe2 />
        </span>
        <div>
          <strong>{title ?? status?.label ?? 'AI web research'}</strong>
          <small>
            {detail ??
              (status?.provider === 'codex'
                ? status.companion
                  ? 'Uses your Mac and ChatGPT subscription'
                  : 'Uses your ChatGPT subscription'
                : (status?.model ?? 'Checking the research connection'))}
          </small>
          {status?.capabilities.localBrowser ? (
            <small>
              Public websites · Up to{' '}
              {status.capabilities.maximumPagesPerResearch ?? 6} pages per
              account
            </small>
          ) : null}
        </div>
        <div className="research-connection-actions">
          <output
            className={`connection-badge ${!checking && status?.configured ? 'connection-ready' : ''}`}
          >
            {checking
              ? 'Checking…'
              : status?.configured
                ? status.provider === 'codex'
                  ? status.ready === false
                    ? 'Waiting for Mac'
                    : 'Ready'
                  : 'Configured'
                : 'Setup needed'}
          </output>
          <Button
            variant="outline"
            size="sm"
            disabled={checking}
            onClick={onRefresh}
          >
            {checking ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Check again
          </Button>
        </div>
      </div>
      {!checking && (!status?.configured || status.ready === false) ? (
        <p className="research-connection-error" role="alert">
          {status?.error ||
            'Connect a research provider in your local settings, then check again.'}
        </p>
      ) : null}
    </section>
  );
}
