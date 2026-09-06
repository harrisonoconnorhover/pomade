'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import {
  resolveCodexSettings,
  type CodexModel,
  type CodexResearchSettings,
} from '@/lib/codex-models.mjs';

type SettingsData = {
  defaults: CodexResearchSettings;
  models: CodexModel[];
  updatedAt: number;
  error?: string;
};

export function useCodexResearchSettings(active: boolean) {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    revision: number;
    data: SettingsData;
  }>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void fetch(`/api/providers/research/settings?refresh=${revision > 0}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Research settings could not be loaded.');
        const data = (await response.json()) as SettingsData;
        if (!controller.signal.aborted) setSnapshot({ revision, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setSnapshot({
            revision,
            data: {
              defaults: {},
              models: [],
              updatedAt: 0,
              error: error.message,
            },
          });
      });
    return () => controller.abort();
  }, [active, revision]);
  return {
    data: snapshot?.data,
    loading: active && snapshot?.revision !== revision,
    saving,
    saveError,
    refresh: () => setRevision((value) => value + 1),
    save: async (defaults: CodexResearchSettings) => {
      setSaving(true);
      setSaveError('');
      try {
        const response = await fetch('/api/providers/research/settings', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ defaults }),
        });
        const data = (await response.json()) as SettingsData;
        if (!response.ok)
          throw new Error(
            data.error || 'Research settings could not be saved.',
          );
        setSnapshot({ revision, data });
        return true;
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Save failed.');
        return false;
      } finally {
        setSaving(false);
      }
    },
  };
}

export function CodexModelPicker({
  value,
  defaults = {},
  models = [],
  onChange,
  inherit = false,
  disabled = false,
  label,
}: {
  value?: CodexResearchSettings;
  defaults?: CodexResearchSettings;
  models?: CodexModel[];
  onChange: (value: CodexResearchSettings | undefined) => void;
  inherit?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const inherited = inherit && value === undefined;
  const selected = inherited ? defaults : (value ?? {});
  const model = selected.model
    ? models.find((item) => item.id === selected.model)
    : models.find((item) => item.isDefault);
  let error = '';
  if (models.length)
    try {
      resolveCodexSettings(models, selected);
    } catch (failure) {
      error =
        failure instanceof Error ? failure.message : 'Unsupported settings.';
    }
  return (
    <fieldset className="codex-model-picker" disabled={disabled}>
      <legend>{label}</legend>
      {inherit ? (
        <label className="codex-inherit">
          <input
            type="checkbox"
            checked={inherited}
            onChange={(event) =>
              onChange(event.target.checked ? undefined : { ...defaults })
            }
          />
          Use app defaults
        </label>
      ) : null}
      <div className="codex-model-fields">
        <label>
          Model
          <select
            aria-label={`${label} model`}
            value={selected.model ?? ''}
            disabled={inherited || !models.length}
            onChange={(event) =>
              onChange(event.target.value ? { model: event.target.value } : {})
            }
          >
            <option value="">
              Codex default
              {models.find((item) => item.isDefault)
                ? ` · ${models.find((item) => item.isDefault)!.name}`
                : ''}
            </option>
            {selected.model &&
            !models.some((item) => item.id === selected.model) ? (
              <option value={selected.model}>
                {selected.model} · unavailable
              </option>
            ) : null}
            {models.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reasoning effort
          <select
            aria-label={`${label} reasoning effort`}
            value={selected.reasoningEffort ?? ''}
            disabled={inherited || !model}
            onChange={(event) =>
              onChange({
                ...selected,
                reasoningEffort: event.target.value || undefined,
              })
            }
          >
            <option value="">
              Model default{model ? ` · ${model.defaultReasoningEffort}` : ''}
            </option>
            {selected.reasoningEffort &&
            !model?.efforts.some(
              (item) => item.value === selected.reasoningEffort,
            ) ? (
              <option value={selected.reasoningEffort}>
                {selected.reasoningEffort} · unsupported
              </option>
            ) : null}
            {model?.efforts.map((item) => (
              <option value={item.value} key={item.value}>
                {item.value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!models.length ? (
        <p className="source-help">
          Account models are not loaded yet. Open ChatGPT research defaults
          below to check the connection and refresh models.
        </p>
      ) : null}
      {model ? (
        <p className="source-help">
          {
            model.efforts.find(
              (item) =>
                item.value ===
                (selected.reasoningEffort ?? model.defaultReasoningEffort),
            )?.description
          }
        </p>
      ) : null}
      {error ? (
        <p className="source-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function CodexDefaultsEditor({
  state,
}: {
  state: ReturnType<typeof useCodexResearchSettings>;
}) {
  const [draft, setDraft] = useState<CodexResearchSettings>();
  const [saved, setSaved] = useState(false);
  const value = draft ?? state.data?.defaults ?? {};
  return (
    <details className="codex-defaults">
      <summary>ChatGPT research defaults</summary>
      <p className="source-help">
        Shared by columns using app defaults in this installation. Higher effort
        can take longer and use more of your subscription allowance.
      </p>
      <CodexModelPicker
        label="App default"
        value={value}
        models={state.data?.models}
        disabled={state.loading || state.saving}
        onChange={(next) => {
          setDraft(next ?? {});
          setSaved(false);
        }}
      />
      <div className="codex-settings-actions">
        <Button
          variant="outline"
          disabled={state.loading || state.saving}
          onClick={state.refresh}
        >
          <RefreshCw />
          {state.loading ? 'Loading…' : 'Refresh models'}
        </Button>
        <Button
          disabled={
            state.loading ||
            state.saving ||
            !state.data?.models.length ||
            !draft
          }
          onClick={async () => {
            if (await state.save(value)) {
              setDraft(undefined);
              setSaved(true);
            }
          }}
        >
          {state.saving ? 'Saving…' : 'Save app defaults'}
        </Button>
      </div>
      {state.data?.updatedAt ? (
        <p className="source-help">
          Account models checked{' '}
          {new Date(state.data.updatedAt).toLocaleString()}.
        </p>
      ) : null}
      {state.data?.error || state.saveError ? (
        <p className="source-error" role="alert">
          {state.saveError || state.data?.error}
        </p>
      ) : null}
      {saved ? (
        <output className="source-help">Research defaults saved.</output>
      ) : null}
    </details>
  );
}
