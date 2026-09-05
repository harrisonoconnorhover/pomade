import { describe, expect, it } from 'vitest';
import {
  exportRecipeFile,
  importRecipeFile,
  MAX_RECIPE_FILE_BYTES,
} from './recipe-file';
import {
  createRecipeTemplate,
  defaultTemplateBindings,
  instantiateRecipeTemplate,
} from './recipe-templates';
import { executeWorkspace } from './local-recipe-engine';
import type { PomadeColumn } from './pomade-types';

const source: PomadeColumn = {
  id: 'greeting',
  title: 'Greeting',
  kind: 'formula',
  width: 200,
  recipe: 'custom-formula',
  expression: '{{person | first}}',
  autoRun: true,
  runCondition: { field: 'person', operator: 'is_not_empty' },
};
const template = () =>
  createRecipeTemplate(
    source,
    [{ id: 'person', title: 'Name', kind: 'text', width: 160 }],
    { id: 'original', name: 'Greeting' },
  );

describe('portable recipe files', () => {
  it('round trips, remaps inputs and executes on another table without changing the source', () => {
    const original = template();
    const imported = importRecipeFile(exportRecipeFile(original), 'fresh', 123);
    const columns: PomadeColumn[] = [
      { id: 'contact', title: 'Name', kind: 'text', width: 160 },
    ];
    const bindings = defaultTemplateBindings(imported, columns);
    const added = instantiateRecipeTemplate(imported, columns, bindings);
    const result = executeWorkspace({
      id: 'other',
      name: 'Other',
      columns: [...columns, ...added],
      rows: [{ id: 'one', values: { contact: 'Ada Lovelace' } }],
      updatedAt: 1,
    });
    expect(result.workspace.rows[0].values.greeting).toBe('Ada');
    expect(added[0].runCondition).toMatchObject({ field: 'contact' });
    expect(imported).toMatchObject({ id: 'fresh', createdAt: 123 });
    expect(original.id).toBe('original');
  });

  it('exports configuration only and removes cross-table list projections', () => {
    const original = template();
    Object.assign(original, {
      rows: [{ values: { email: 'private@example.com' } }],
      apiKey: 'secret',
    });
    original.column.listDestinationBindings = { greeting: 'person' };
    const serialized = exportRecipeFile(original);
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('listDestinationBindings');
  });

  it('preserves structured list research and requires its prompt inputs', () => {
    const research: PomadeColumn = {
      id: 'company',
      title: 'Company',
      kind: 'enrichment',
      width: 300,
      recipe: 'web-research',
      prompt: 'Find companies like {{seed}}',
      outputCardinality: 'list',
      listLimit: 12,
      outputFields: [
        { id: 'company', title: 'Company', valueType: 'text' },
        { id: 'founded', title: 'Founded', valueType: 'date' },
      ],
    };
    const imported = importRecipeFile(
      exportRecipeFile(
        createRecipeTemplate(research, [], { id: 'a', name: 'Research' }),
      ),
      'b',
    );
    expect(imported.column).toMatchObject({
      prompt: research.prompt,
      outputFields: research.outputFields,
      listLimit: 12,
    });
    expect(() => instantiateRecipeTemplate(imported, [], {})).toThrow(
      'Seed needs an input column',
    );
  });

  it('preserves waterfall priority and lineage', () => {
    const waterfall: PomadeColumn = {
      id: 'best',
      title: 'Best',
      kind: 'formula',
      width: 200,
      recipe: 'waterfall',
      lineageColumnId: 'origin',
      waterfallSteps: [
        { field: 'crm', label: 'CRM' },
        { field: 'research', label: 'Research' },
      ],
      outputFields: [
        { id: 'best', title: 'Best', valueType: 'text' },
        { id: 'origin', title: 'Origin', valueType: 'text' },
      ],
    };
    const imported = importRecipeFile(
      exportRecipeFile(
        createRecipeTemplate(waterfall, [], { id: 'a', name: 'Waterfall' }),
      ),
      'b',
    );
    expect(imported.column.waterfallSteps).toEqual(waterfall.waterfallSteps);
    expect(imported.column.lineageColumnId).toBe('origin');
  });

  it('rejects malformed, oversized and future files without accepting executable recipes', () => {
    expect(() => importRecipeFile('{', 'a')).toThrow('valid Pomade');
    expect(() =>
      importRecipeFile(' '.repeat(MAX_RECIPE_FILE_BYTES + 1), 'a'),
    ).toThrow('256 KB');
    const file = JSON.parse(exportRecipeFile(template()));
    for (const change of [
      { version: 2 },
      { rows: [] },
      { column: { ...file.column, recipe: 'shell' } },
      {
        column: {
          ...file.column,
          outputFields: [{ id: 'wrong', title: 'Wrong', valueType: 'text' }],
        },
      },
      { inputColumns: [{ id: '__proto__', title: 'Unsafe key' }] },
    ]) {
      expect(() =>
        importRecipeFile(JSON.stringify({ ...file, ...change }), 'a'),
      ).toThrow();
    }
  });
});
