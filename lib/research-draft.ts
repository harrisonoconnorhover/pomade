export type ResearchDraftMode = 'single' | 'structured' | 'list';
type Field = { key: string; title: string; valueType: string };

// Format changes may adapt untouched examples, never replace a user's draft.
export function changeResearchDraftMode<T extends Field>(
  draft: { mode: ResearchDraftMode; prompt: string; fields: T[] },
  mode: ResearchDraftMode,
  defaults: {
    prompt: string;
    listPrompt: string;
    fields: T[];
    listFields: T[];
  },
) {
  if (mode === draft.mode) return draft;
  const toList = mode === 'list';
  const sameFields = (a: T[], b: T[]) =>
    JSON.stringify(a) === JSON.stringify(b);
  const prompt =
    toList && draft.prompt === defaults.prompt
      ? defaults.listPrompt
      : draft.mode === 'list' && !toList && draft.prompt === defaults.listPrompt
        ? defaults.prompt
        : draft.prompt;
  const fields =
    toList && sameFields(draft.fields, defaults.fields)
      ? defaults.listFields
      : draft.mode === 'list' &&
          !toList &&
          sameFields(draft.fields, defaults.listFields)
        ? defaults.fields
        : draft.fields;
  return { mode, prompt, fields };
}
