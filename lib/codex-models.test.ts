import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  resolveCodexSettings,
  validateCodexSettings,
  codexCacheIdentity,
  type CodexModel,
} from './codex-models.mjs';
import { CodexModelPicker } from '../components/codex-research-settings';
import { webResearchCacheKey } from './web-research';
import {
  createRecipeTemplate,
  instantiateRecipeTemplate,
} from './recipe-templates';
import { createSampleWorkspace } from './sample-workspace';

const models: CodexModel[] = [
  {
    id: 'model-a',
    name: 'Model A',
    isDefault: true,
    defaultReasoningEffort: 'medium',
    efforts: [
      { value: 'medium', description: 'Balanced' },
      { value: 'high', description: 'Deeper' },
    ],
  },
  {
    id: 'model-b',
    name: 'Model B',
    isDefault: false,
    defaultReasoningEffort: 'low',
    efforts: [{ value: 'low', description: 'Fast' }],
  },
];
describe('account research settings', () => {
  it('resolves defaults and explicit selections using actual model capabilities', () => {
    expect(resolveCodexSettings(models, {})).toEqual({
      model: 'model-a',
      reasoningEffort: 'medium',
    });
    expect(resolveCodexSettings(models, { model: 'model-b' })).toEqual({
      model: 'model-b',
      reasoningEffort: 'low',
    });
    expect(resolveCodexSettings(models, { reasoningEffort: 'high' })).toEqual({
      model: 'model-a',
      reasoningEffort: 'high',
    });
    expect(() =>
      resolveCodexSettings(models, {
        model: 'model-b',
        reasoningEffort: 'high',
      }),
    ).toThrow('does not support');
    expect(() =>
      resolveCodexSettings(models, { model: 'removed-model' }),
    ).toThrow('current model list');
    expect(() => resolveCodexSettings([], {})).toThrow('no default');
  });
  it('validates stored settings without preserving unrelated fields', () => {
    expect(
      validateCodexSettings({ model: 'model-a', apiKey: 'private' }),
    ).toEqual({ model: 'model-a' });
    expect(() => validateCodexSettings({ reasoningEffort: 123 })).toThrow();
    expect(() => validateCodexSettings({ model: 'x\n--unsafe' })).toThrow();
  });
  it('isolates cached answers by model, effort and browser mode', async () => {
    const identities = [
      codexCacheIdentity({ model: 'model-a', reasoningEffort: 'medium' }, true),
      codexCacheIdentity({ model: 'model-a', reasoningEffort: 'high' }, true),
      codexCacheIdentity({ model: 'model-b', reasoningEffort: 'high' }, true),
      codexCacheIdentity(
        { model: 'model-a', reasoningEffort: 'medium' },
        false,
      ),
    ];
    const keys = await Promise.all(
      identities.map((id) => webResearchCacheKey(id, 'Same prompt')),
    );
    expect(new Set(keys).size).toBe(4);
  });
  it('shows only supported effort options and keeps inherited values visible', () => {
    const html = renderToStaticMarkup(
      createElement(CodexModelPicker, {
        models,
        value: { model: 'model-b' },
        label: 'Research',
        onChange: () => {},
      }),
    );
    expect(html).toContain('value="low"');
    expect(html).not.toContain('value="high"');
    const inherited = renderToStaticMarkup(
      createElement(CodexModelPicker, {
        models,
        defaults: { model: 'model-a', reasoningEffort: 'high' },
        inherit: true,
        label: 'Research',
        onChange: () => {},
      }),
    );
    expect(inherited).toContain('Use app defaults');
    expect(inherited).toContain('disabled=""');
    expect(inherited).toContain('value="high" selected=""');
  });
  it('preserves column overrides through reusable templates without sharing mutable settings', () => {
    const workspace = createSampleWorkspace();
    const column = {
      id: 'research',
      title: 'Research',
      kind: 'enrichment' as const,
      width: 200,
      recipe: 'web-research' as const,
      prompt: 'Research {{company}}',
      codexResearch: { model: 'model-b', reasoningEffort: 'low' },
    };
    const template = createRecipeTemplate(column, workspace.columns, {
      id: 't',
      name: 'Research',
    });
    const [added] = instantiateRecipeTemplate(template, workspace.columns, {
      company: 'company',
    });
    expect(added.codexResearch).toEqual(column.codexResearch);
    added.codexResearch!.model = 'model-a';
    expect(template.column.codexResearch!.model).toBe('model-b');
  });
});
