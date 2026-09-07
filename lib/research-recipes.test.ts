import { describe, expect, it, vi } from 'vitest';
import { RESEARCH_RECIPES, prepareResearchRecipe } from './research-recipes';
import { instantiateRecipeTemplate } from './recipe-templates';
import { exportRecipeFile, importRecipeFile } from './recipe-file';
import { createTable } from './workbook';
import { countMaximumExternalActions } from './external-recipes';
import { executeRecipePipeline } from './recipe-pipeline';
import {
  applyWebResearchResult,
  renderWebResearchPrompt,
} from './web-research';
import type { PomadeColumn, WorkspaceSnapshot } from './pomade-types';

function setup() {
  const workspace = createTable({
    id: 'research',
    name: 'Research',
    mode: 'empty',
  });
  workspace.columns.push({
    id: 'site_url',
    title: 'Website',
    kind: 'text',
    width: 200,
  });
  workspace.rows = [
    {
      id: 'one',
      values: {
        company: 'Example',
        domain: 'unused.test',
        site_url: 'example.com',
      },
    },
    {
      id: 'missing',
      values: { company: 'Missing site', domain: 'unused.test', site_url: '' },
    },
  ];
  const bindings = {
    company: 'company',
    domain: 'site_url',
    person: '',
    title: '',
  };
  return { workspace, bindings };
}

describe('buying-signal research recipes', () => {
  it('runs four research actions into 24 structured columns and skips rows without the mapped website', async () => {
    const { workspace, bindings } = setup();
    const primary: PomadeColumn[] = [];
    for (const template of RESEARCH_RECIPES) {
      const added = instantiateRecipeTemplate(
        template,
        workspace.columns,
        bindings,
      );
      workspace.columns.push(...added);
      primary.push(added[0]);
    }
    // The estimate covers both rows; execution evaluates their mapped conditions.
    expect(countMaximumExternalActions(workspace.rows, workspace.columns)).toBe(
      8,
    );
    const external = vi.fn(
      async (
        current: WorkspaceSnapshot,
        rowId: string,
        column: PomadeColumn,
      ) => {
        const row = current.rows.find((r: { id: string }) => r.id === rowId)!;
        const prompt = renderWebResearchPrompt(
          column.prompt!,
          row,
          column.outputFields,
          column.inputBindings,
        );
        expect(prompt).toContain('example.com');
        expect(prompt).not.toContain('unused.test');
        const payload = Object.fromEntries(
          column.outputFields!.map((f, i) => [
            f.id,
            i === 0
              ? 'Partial'
              : f.valueType === 'date'
                ? null
                : 'A limited observed fact',
          ]),
        );
        return applyWebResearchResult(
          current,
          rowId,
          column,
          {
            answer: JSON.stringify(payload),
            citations: [
              { title: 'Example evidence', url: 'https://example.com/about' },
            ],
            queries: [],
            cached: false,
            model: 'fixture',
          },
          Date.now(),
          'parallel',
        );
      },
    );
    const result = await executeRecipePipeline(
      workspace,
      undefined,
      primary.map((c) => c.id),
      {},
      external,
    );
    expect(external).toHaveBeenCalledTimes(4);
    expect(result.run.skippedCount).toBe(4);
    for (const column of primary) {
      expect(result.workspace.rows[0].values[column.id]).toBe('Partial');
      expect(column.outputFields).toHaveLength(6);
      expect(result.workspace.rows[1].values[column.id]).toBeUndefined();
    }
  });

  it('keeps unavailable facts blank and uncited results in review, including after a previous positive result', () => {
    const { workspace, bindings } = setup();
    const columns = instantiateRecipeTemplate(
      RESEARCH_RECIPES[1],
      workspace.columns,
      bindings,
    );
    workspace.columns.push(...columns);
    for (const column of columns)
      workspace.rows[0].values[column.id] = 'Stale value';
    const payload = Object.fromEntries(
      columns.map((c, i) => [c.id, i === 0 ? 'Not found' : null]),
    );
    const result = applyWebResearchResult(
      workspace,
      'one',
      columns[0],
      {
        answer: JSON.stringify(payload),
        citations: [],
        queries: [],
        cached: false,
        model: 'fixture',
      },
      Date.now(),
      'parallel',
    );
    expect(result.receipt.status).toBe('review');
    expect(result.workspace.rows[0].values[columns[0].id]).toBe('Not found');
    for (const column of columns.slice(1))
      expect(result.workspace.rows[0].values[column.id]).toBe('');
  });

  it('preserves a custom focus and provider through export, import, and remapping without modifying the built-in', () => {
    const { workspace, bindings } = setup(),
      original = RESEARCH_RECIPES[2];
    const configured = prepareResearchRecipe(original, {
      provider: 'parallel',
      focus: 'Investigate HubSpot and Salesforce first.',
    });
    const imported = importRecipeFile(exportRecipeFile(configured), 'imported');
    const first = instantiateRecipeTemplate(
      imported,
      workspace.columns,
      bindings,
    );
    const second = instantiateRecipeTemplate(
      imported,
      [...workspace.columns, ...first],
      bindings,
    );
    expect(first[0].researchProvider).toBe('parallel');
    expect(first[0].prompt).toContain(
      'Investigate HubSpot and Salesforce first.',
    );
    expect(original.column.prompt).not.toContain(
      'Investigate HubSpot and Salesforce first.',
    );
    expect(new Set([...first, ...second].map((c) => c.id)).size).toBe(12);
    expect(second[0].outputFields?.map((f) => f.id)).toEqual(
      second.map((c) => c.id),
    );
    expect(second[0].runCondition).toEqual({
      field: 'site_url',
      operator: 'is_not_empty',
    });
  });

  it('refuses to overflow a sheet or introduce hidden input requirements from plain-text focus', () => {
    const { workspace, bindings } = setup();
    while (workspace.columns.length < 95)
      workspace.columns.push({
        id: 'extra_' + workspace.columns.length,
        title: 'Extra',
        kind: 'text',
        width: 100,
      });
    expect(() =>
      instantiateRecipeTemplate(
        RESEARCH_RECIPES[0],
        workspace.columns,
        bindings,
      ),
    ).toThrow('100 columns');
    expect(() =>
      prepareResearchRecipe(RESEARCH_RECIPES[0], { focus: 'Use {{unmapped}}' }),
    ).toThrow('plain text');
  });
});
