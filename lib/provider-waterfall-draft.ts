import {
  CONTACT_VERIFIER_PRESETS,
  contactPreset,
  type ContactBindings,
  type ContactProviderPreset,
} from './contact-provider-presets';
import type {
  HttpProviderStep,
  ProviderWaterfall,
  WorkspaceSnapshot,
} from './pomade-types';
export type WaterfallStepDraft = HttpProviderStep & { quickSetup?: string };
export function waterfallColumnIdentity(
  workspace: WorkspaceSnapshot,
  input: string,
) {
  const requested = input.trim();
  if (!requested || requested.length > 80)
    throw new Error('Use a result name between 1 and 80 characters.');
  const usedTitles = new Set(
    workspace.columns.map((c) => c.title.toLowerCase()),
  );
  let title = requested,
    n = 2;
  while (usedTitles.has(title.toLowerCase())) {
    const suffix = ` (${n++})`;
    title = requested.slice(0, 80 - suffix.length) + suffix;
  }
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 60) || 'provider_result';
  const usedIds = new Set(workspace.columns.map((c) => c.id));
  let id = base;
  n = 2;
  while (
    [id, `${id}_provider`, `${id}_status`].some((candidate) =>
      usedIds.has(candidate),
    )
  )
    id = `${base}_${n++}`;
  return { id, title };
}
export function chooseWaterfallPreset(
  steps: WaterfallStepDraft[],
  index: number,
  preset: ContactProviderPreset,
  bindings: ContactBindings,
  accept: ProviderWaterfall['accept'],
) {
  const existing = CONTACT_VERIFIER_PRESETS.find(
    (v) => v.id === steps[index]?.verifier?.presetId,
  );
  const verifier =
    existing &&
    existing.accept.includes('phone') === preset.accept.includes('phone')
      ? { presetId: existing.id }
      : undefined;
  return {
    steps: steps.map((step, i) =>
      i === index
        ? { ...preset.step(bindings), quickSetup: preset.id, verifier }
        : step,
    ),
    accept: steps.some((s, i) => i !== index && s.connectionId)
      ? accept
      : existing && verifier
        ? existing.accept
        : preset.accept,
  };
}
export function chooseWaterfallVerifier(
  steps: WaterfallStepDraft[],
  index: number,
  verifierId: string,
  accept: ProviderWaterfall['accept'],
) {
  const verifier = CONTACT_VERIFIER_PRESETS.find((v) => v.id === verifierId);
  const sole = !steps.some((s, i) => i !== index && s.connectionId);
  return {
    steps: steps.map((step, i) =>
      i === index
        ? {
            ...step,
            verifier: verifier ? { presetId: verifier.id } : undefined,
          }
        : step,
    ),
    accept:
      verifier?.accept ??
      (sole
        ? (contactPreset(steps[index]?.quickSetup)?.accept ?? accept)
        : accept),
  };
}
