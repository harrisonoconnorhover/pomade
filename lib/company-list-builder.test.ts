import { describe, expect, it } from 'vitest';

import { createCompanyListWorkspace } from './company-list-builder';
import { createRecipeSchedule } from './recipe-schedule';
import { createSampleWorkspace } from './sample-workspace';

describe('company list builder', () => {
  it('adds a scoped list recipe without replacing existing data', () => {
    const original = createSampleWorkspace();
    const result = createCompanyListWorkspace(original, {
      brief: ' US fintech companies selling to RevOps teams ',
      limit: 15,
      sourceRowId: 'source-row',
      now: 1_000,
    });
    const recipe = result.workspace.columns.find(
      (column) => column.id === result.researchColumnId,
    )!;

    expect(result.workspace.rows).toHaveLength(original.rows.length + 1);
    expect(result.workspace.rows[1].values.company).toBe('Mercury');
    expect(result.workspace.rows[0]).toMatchObject({
      id: 'source-row',
      values: {
        company: 'ICP search',
        search_brief: 'US fintech companies selling to RevOps teams',
        status: 'Draft',
      },
    });
    expect(recipe).toMatchObject({
      recipe: 'web-research',
      outputCardinality: 'list',
      listLimit: 15,
      inputBindings: { search_brief: 'search_brief' },
      runCondition: { field: 'search_brief', operator: 'is_not_empty' },
    });
    expect(recipe.outputFields).toHaveLength(5);
    expect(recipe.listDestinationBindings).toEqual({
      target_company: 'company',
      target_domain: 'domain',
    });
  });

  it('creates collision-safe outputs and pauses an active schedule', () => {
    const original = createSampleWorkspace();
    original.columns.splice(-1, 0, {
      id: 'target_company',
      title: 'Target company',
      kind: 'text',
      width: 180,
    });
    original.schedule = createRecipeSchedule({
      id: 'schedule-1',
      cadence: 'every_day',
      nextRunAt: 50_000,
      now: 1_000,
    });

    const first = createCompanyListWorkspace(original, {
      brief: 'Developer tools in North America',
      limit: 99,
      sourceRowId: 'source-1',
      now: 2_000,
    });
    const second = createCompanyListWorkspace(first.workspace, {
      brief: 'Vertical SaaS in Europe',
      limit: 5,
      sourceRowId: 'source-2',
      now: 3_000,
    });
    const firstRecipe = first.workspace.columns.find(
      (column) => column.id === first.researchColumnId,
    )!;
    const secondRecipe = second.workspace.columns.find(
      (column) => column.id === second.researchColumnId,
    )!;

    expect(first.schedulePaused).toBe(true);
    expect(first.workspace.schedule).toMatchObject({
      enabled: false,
      state: 'paused',
      updatedAt: 2_000,
    });
    expect(firstRecipe.id).toBe('target_company_2');
    expect(firstRecipe.listLimit).toBe(25);
    expect(secondRecipe.id).not.toBe(firstRecipe.id);
    expect(secondRecipe.title).not.toBe(firstRecipe.title);
    expect(second.workspace.rows.slice(0, 2).map((row) => row.id)).toEqual([
      'source-2',
      'source-1',
    ]);
    expect(
      new Set(second.workspace.columns.map((column) => column.id)).size,
    ).toBe(second.workspace.columns.length);
  });
});
