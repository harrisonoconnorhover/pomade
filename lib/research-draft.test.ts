import { describe, expect, it } from 'vitest';
import { changeResearchDraftMode } from './research-draft';
const defaults = {
  prompt: 'Find a recent trigger',
  listPrompt: 'Find target companies',
  fields: [{ key: 'trigger', title: 'Trigger', valueType: 'text' }],
  listFields: [{ key: 'company', title: 'Company', valueType: 'text' }],
};
describe('research output format changes', () => {
  it('adapts untouched examples to the selected format', () => {
    const list = changeResearchDraftMode(
      { mode: 'single', prompt: defaults.prompt, fields: defaults.fields },
      'list',
      defaults,
    );
    expect(list).toEqual({
      mode: 'list',
      prompt: defaults.listPrompt,
      fields: defaults.listFields,
    });
    expect(changeResearchDraftMode(list, 'single', defaults)).toEqual({
      mode: 'single',
      prompt: defaults.prompt,
      fields: defaults.fields,
    });
  });
  it('preserves a custom prompt through a format round trip', () => {
    const prompt =
      'Find open SDR roles posted in the last month and include their locations.';
    const list = changeResearchDraftMode(
      { mode: 'single', prompt, fields: defaults.fields },
      'list',
      defaults,
    );
    expect(list.prompt).toBe(prompt);
    expect(changeResearchDraftMode(list, 'single', defaults).prompt).toBe(
      prompt,
    );
  });
  it('preserves edited field labels and types even while the single-answer format hides them', () => {
    const fields = [
      { key: 'trigger', title: 'Open SDR roles', valueType: 'number' },
      { key: 'location', title: 'Hiring location', valueType: 'text' },
    ];
    const single = changeResearchDraftMode(
      { mode: 'structured', prompt: defaults.prompt, fields },
      'single',
      defaults,
    );
    const list = changeResearchDraftMode(single, 'list', defaults);
    expect(list.fields).toBe(fields);
    expect(changeResearchDraftMode(list, 'structured', defaults).fields).toBe(
      fields,
    );
  });
});
