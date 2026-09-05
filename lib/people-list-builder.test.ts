import { describe, expect, it } from 'vitest';

import { createPeopleListWorkspace } from './people-list-builder';
import { createRecipeSchedule } from './recipe-schedule';
import { createSampleWorkspace } from './sample-workspace';

describe('people list builder', () => {
  it('adds a scoped people finder to the selected company row', () => {
    const original = createSampleWorkspace();
    const result = createPeopleListWorkspace(original, {
      rowId: 'sample-1',
      brief: ' Revenue operations and go-to-market leaders ',
      limit: 12,
      now: 1_000,
    });
    const recipe = result.workspace.columns.find(
      (column) => column.id === result.researchColumnId,
    )!;

    expect(result.workspace.rows).toHaveLength(original.rows.length);
    expect(result.workspace.rows[0].values).toMatchObject({
      company: 'Mercury',
      domain: 'mercury.com',
      people_search_brief: 'Revenue operations and go-to-market leaders',
    });
    expect(recipe).toMatchObject({
      recipe: 'web-research',
      outputCardinality: 'list',
      listLimit: 12,
      inputBindings: {
        company: 'company',
        domain: 'domain',
        people_search_brief: 'people_search_brief',
      },
      runCondition: {
        field: 'people_search_brief',
        operator: 'is_not_empty',
      },
    });
    expect(recipe.outputFields).toHaveLength(5);
    expect(recipe.listDestinationBindings).toEqual({
      target_person: 'person',
      current_title: 'title',
    });
    expect(result.workspace.rows[1].values.people_search_brief).toBe('');
  });

  it('bounds results, avoids column collisions, and pauses schedules', () => {
    const workspace = createSampleWorkspace();
    workspace.columns.splice(-1, 0, {
      id: 'target_person',
      title: 'Target person',
      kind: 'text',
      width: 180,
    });
    workspace.schedule = createRecipeSchedule({
      id: 'schedule-1',
      cadence: 'every_day',
      nextRunAt: 50_000,
      now: 1_000,
    });

    const result = createPeopleListWorkspace(workspace, {
      rowId: 'sample-2',
      brief: 'Founders',
      limit: 100,
      now: 2_000,
    });
    const recipe = result.workspace.columns.find(
      (column) => column.id === result.researchColumnId,
    )!;

    expect(recipe.id).toBe('target_person_2');
    expect(recipe.listLimit).toBe(25);
    expect(result.schedulePaused).toBe(true);
    expect(result.workspace.schedule).toMatchObject({
      state: 'paused',
      enabled: false,
      updatedAt: 2_000,
    });
  });

  it('requires a real company target', () => {
    const workspace = createSampleWorkspace();
    workspace.rows[0].values.company = '';
    workspace.rows[0].values.domain = '';

    expect(() =>
      createPeopleListWorkspace(workspace, {
        rowId: 'sample-1',
        brief: 'Sales leaders',
        limit: 10,
      }),
    ).toThrow('needs a company or company domain');
  });
});
