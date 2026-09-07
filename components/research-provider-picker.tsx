'use client';
import type { PomadeColumn } from '@/lib/pomade-types';
export default function ResearchProviderPicker({
  value,
  defaultProvider,
  disabled,
  onChange,
}: {
  value: PomadeColumn['researchProvider'];
  defaultProvider?: string | null;
  disabled: boolean;
  onChange: (value: PomadeColumn['researchProvider']) => void;
}) {
  const provider = value ?? defaultProvider;
  return (
    <label className="research-provider-picker">
      Research with
      <select
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) =>
          onChange(
            (e.target.value || undefined) as PomadeColumn['researchProvider'],
          )
        }
      >
        <option value="">
          Use app default
          {defaultProvider
            ? ` (${defaultProvider === 'codex' ? 'ChatGPT' : defaultProvider})`
            : ''}
        </option>
        <option value="parallel">Parallel · quick web research</option>
        <option value="codex">ChatGPT subscription · deeper research</option>
        <option value="gemini">Gemini · API account</option>
      </select>
      <small>
        {provider === 'codex'
          ? 'Uses the model and effort below. Your Mac must be connected.'
          : provider === 'parallel'
            ? 'Uses your Parallel account and its configured model. Useful for quick, structured questions.'
            : 'Uses the connected provider’s allowance. Provider access is checked when the column runs.'}
      </small>
    </label>
  );
}
