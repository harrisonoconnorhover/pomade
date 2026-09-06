export class CodexSettingsError extends Error {}

/** @typedef {{model?: string, reasoningEffort?: string}} CodexResearchSettings */
/** @typedef {{id: string, name: string, isDefault: boolean, defaultReasoningEffort: string, efforts: {value: string, description: string}[]}} CodexModel */

/** @param {unknown} value @returns {CodexResearchSettings} */
export function validateCodexSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CodexSettingsError('Invalid research settings.');
  const { model, reasoningEffort } = value;
  if (
    model !== undefined &&
    (typeof model !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(model))
  )
    throw new CodexSettingsError('Choose a model from the account model list.');
  if (
    reasoningEffort !== undefined &&
    (typeof reasoningEffort !== 'string' ||
      !/^[a-z]{1,20}$/.test(reasoningEffort))
  )
    throw new CodexSettingsError('Choose a supported reasoning effort.');
  return {
    ...(model ? { model } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

/** @param {CodexModel[]} models @param {CodexResearchSettings} settings */
export function resolveCodexSettings(models, settings = {}) {
  const requested = validateCodexSettings(settings);
  const model = requested.model
    ? models.find((m) => m.id === requested.model)
    : models.find((m) => m.isDefault);
  if (!model)
    throw new CodexSettingsError(
      requested.model
        ? `The model ${requested.model} is not in this account’s current model list. Refresh the models and choose another.`
        : 'The account model list has no default. Choose a model explicitly.',
    );
  const reasoningEffort =
    requested.reasoningEffort ?? model.defaultReasoningEffort;
  if (!model.efforts.some((e) => e.value === reasoningEffort))
    throw new CodexSettingsError(
      `${model.name} does not support ${reasoningEffort} effort. Choose one of its listed effort levels.`,
    );
  return { model: model.id, reasoningEffort };
}

/** @param {unknown} value @returns {value is CodexModel[]} */
export function validCodexModels(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 100 &&
    value.every(
      (m) =>
        m &&
        typeof m.id === 'string' &&
        /^[a-zA-Z0-9._-]{1,100}$/.test(m.id) &&
        typeof m.name === 'string' &&
        m.name.length <= 200 &&
        typeof m.isDefault === 'boolean' &&
        typeof m.defaultReasoningEffort === 'string' &&
        Array.isArray(m.efforts) &&
        m.efforts.length <= 20 &&
        m.efforts.every(
          (e) =>
            e &&
            typeof e.value === 'string' &&
            /^[a-z]{1,20}$/.test(e.value) &&
            typeof e.description === 'string' &&
            e.description.length <= 1000,
        ),
    )
  );
}

/** @param {CodexResearchSettings} settings @param {boolean} browser */
export function codexCacheIdentity(settings, browser) {
  return JSON.stringify([
    'codex-v2',
    settings.model ?? '',
    settings.reasoningEffort ?? '',
    browser,
  ]);
}
