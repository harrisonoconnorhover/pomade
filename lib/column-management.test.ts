import { describe, expect, it } from 'vitest';

import {
  deleteWorkspaceColumn,
  findColumnDependencies,
  renameWorkspaceColumn,
  updateResearchColumnSettings,
  researchSettingsChanged,
} from './column-management';
import { createRecipeSchedule } from './recipe-schedule';
import { createSampleWorkspace } from './sample-workspace';
import { createTable } from './workbook';
import { executeWorkspace } from './local-recipe-engine';

describe('column management', () => {
  it('renames a column while preserving its stable ID and row values', () => {
    const workspace = createSampleWorkspace();
    const renamed = renameWorkspaceColumn(
      workspace,
      'company',
      '  Account name  ',
      1_000,
    );

    expect(renamed.columns[0]).toMatchObject({
      id: 'company',
      title: 'Account name',
    });
    expect(renamed.rows[0].values.company).toBe('Mercury');
    expect(renamed.updatedAt).toBe(1_000);
  });

  it('updates structured output titles and default waterfall labels', () => {
    const workspace = createSampleWorkspace();
    workspace.columns.push(
      {
        id: 'research',
        title: 'Research',
        kind: 'enrichment',
        recipe: 'web-research',
        width: 200,
        outputFields: [
          { id: 'research', title: 'Research', valueType: 'text' },
          { id: 'signal', title: 'Signal', valueType: 'text' },
        ],
      },
      {
        id: 'signal',
        title: 'Signal',
        kind: 'text',
        width: 180,
      },
      {
        id: 'best_signal',
        title: 'Best signal',
        kind: 'formula',
        recipe: 'waterfall',
        width: 180,
        waterfallSteps: [{ field: 'signal', label: 'Signal' }],
      },
    );

    const renamed = renameWorkspaceColumn(workspace, 'signal', 'Buying signal');

    expect(
      renamed.columns.find((column) => column.id === 'research')?.outputFields,
    ).toContainEqual({
      id: 'signal',
      title: 'Buying signal',
      valueType: 'text',
    });
    expect(
      renamed.columns.find((column) => column.id === 'best_signal')
        ?.waterfallSteps,
    ).toEqual([{ field: 'signal', label: 'Buying signal' }]);
  });

  it('rejects blank, duplicate, and missing-column names', () => {
    const workspace = createSampleWorkspace();

    expect(() => renameWorkspaceColumn(workspace, 'company', ' ')).toThrow(
      'between 1 and 80',
    );
    expect(() => renameWorkspaceColumn(workspace, 'company', 'Person')).toThrow(
      'already uses that name',
    );
    expect(() => renameWorkspaceColumn(workspace, 'missing', 'New')).toThrow(
      'no longer exists',
    );
  });

  it('deletes an unused column and its row values', () => {
    const workspace = createSampleWorkspace();
    workspace.columns.push({
      id: 'notes',
      title: 'Notes',
      kind: 'text',
      width: 180,
    });
    workspace.rows[0].values.notes = 'Call next week';

    const updated = deleteWorkspaceColumn(workspace, 'notes', 2_000);

    expect(updated.columns.some((column) => column.id === 'notes')).toBe(false);
    expect(updated.rows[0].values).not.toHaveProperty('notes');
    expect(updated.updatedAt).toBe(2_000);
  });

  it('reports recipe, output, and saved-view dependencies', () => {
    const workspace = createSampleWorkspace();
    workspace.columns.push(
      {
        id: 'formula',
        title: 'Label',
        kind: 'formula',
        width: 180,
        recipe: 'custom-formula',
        expression: '{{company}}',
        runCondition: { field: 'company', operator: 'is_not_empty' },
      },
      {
        id: 'research',
        title: 'Research',
        kind: 'enrichment',
        width: 220,
        recipe: 'web-research',
        listDestinationBindings: { found_company: 'company' },
        outputFields: [
          { id: 'research', title: 'Research', valueType: 'text' },
          { id: 'company', title: 'Company', valueType: 'text' },
        ],
      },
    );
    workspace.savedViews = [
      {
        id: 'view-1',
        name: 'Named accounts',
        columnId: 'company',
        operator: 'is_not_empty',
        createdAt: 1,
      },
    ];

    expect(findColumnDependencies(workspace, 'company')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerTitle: 'Label',
          relationship: 'recipe input',
        }),
        expect.objectContaining({
          ownerTitle: 'Label',
          relationship: 'run condition',
        }),
        expect.objectContaining({
          ownerTitle: 'Research',
          relationship: 'list destination',
        }),
        expect.objectContaining({
          ownerTitle: 'Research',
          relationship: 'structured output',
        }),
        expect.objectContaining({
          ownerTitle: 'Named accounts',
          relationship: 'saved view',
        }),
      ]),
    );
    expect(() => deleteWorkspaceColumn(workspace, 'company')).toThrow(
      'Remove this column from',
    );
  });

  it('protects the status column and pauses a schedule after the last recipe is deleted', () => {
    const workspace = createSampleWorkspace();
    workspace.columns = workspace.columns.filter(
      (column) => column.kind !== 'formula' && column.id !== 'opener',
    );
    workspace.schedule = {
      id: 'schedule-1',
      cadence: 'every_day',
      enabled: true,
      target: 'all',
      confirmExternalResearch: true,
      state: 'active',
      createdAt: 1,
      updatedAt: 1,
    };

    expect(() => deleteWorkspaceColumn(workspace, 'status')).toThrow(
      'required',
    );
    const updated = deleteWorkspaceColumn(workspace, 'fit', 3_000);
    expect(updated.schedule).toMatchObject({
      enabled: false,
      state: 'paused',
      updatedAt: 3_000,
    });
  });

  it('keeps generated child data but detaches it when its recipe is deleted', () => {
    const workspace = createSampleWorkspace();
    workspace.rows.push({
      id: 'child-1',
      parentRowId: 'sample-1',
      generatedByColumnId: 'opener',
      generatedAt: 100,
      values: { company: 'Child', opener: 'Generated value' },
    });

    const updated = deleteWorkspaceColumn(workspace, 'opener');
    const child = updated.rows.find((row) => row.id === 'child-1');

    expect(child?.values).not.toHaveProperty('opener');
    expect(child).not.toHaveProperty('generatedByColumnId');
    expect(child).not.toHaveProperty('parentRowId');
  });
  it('protects the actual input of a remapped waterfall template, not its old field', () => {
    const workspace = createTable({
      id: 'remapped',
      name: 'Remapped',
      mode: 'empty',
    });
    workspace.columns.push(
      { id: 'apollo_email', title: 'Apollo email', kind: 'text', width: 200 },
      {
        id: 'best_email',
        title: 'Best email',
        kind: 'formula',
        recipe: 'waterfall',
        waterfallSteps: [{ field: 'email', label: 'Found email' }],
        inputBindings: { email: 'apollo_email' },
        width: 200,
      },
    );
    workspace.rows = [
      {
        id: 'a',
        values: {
          email: 'old@example.test',
          apollo_email: 'actual@example.test',
          best_email: '',
          status: '',
        },
      },
    ];
    expect(findColumnDependencies(workspace, 'email')).toEqual([]);
    expect(findColumnDependencies(workspace, 'apollo_email')).not.toEqual([]);
    const result = deleteWorkspaceColumn(workspace, 'email');
    expect(
      executeWorkspace(result, ['a']).workspace.rows[0].values.best_email,
    ).toBe('actual@example.test');
    expect(() => deleteWorkspaceColumn(result, 'apollo_email')).toThrow();
  });
});

describe('research column settings', () => {
  function fixture() {
    const workspace = createSampleWorkspace();
    workspace.columns.push({
      id: 'research',
      title: 'Research',
      kind: 'enrichment',
      recipe: 'web-research',
      width: 230,
      prompt: 'Research {{account}}',
      researchProvider: 'parallel',
      inputBindings: { account: 'company' },
      outputFields: [{ id: 'research', title: 'Research', valueType: 'text' }],
      listDestinationBindings: { company: 'company' },
      listLimit: 7,
      autoRun: false,
    });
    workspace.rows[0].values.research = 'Existing sourced answer';
    workspace.schedule = createRecipeSchedule({
      id: 'schedule',
      cadence: 'every_day',
      nextRunAt: 2000,
      now: 1000,
    });
    return workspace;
  }
  it('updates the question and model while preserving results, bindings, outputs and destinations', () => {
    const workspace = fixture();
    const column = workspace.columns.at(-1)!;
    const updated = updateResearchColumnSettings(
      workspace,
      'research',
      {
        ...column,
        title: 'Hiring research',
        prompt: '  Find hiring plans at {{account}}  ',
        researchProvider: 'codex',
        codexResearch: { model: 'gpt-5.5', reasoningEffort: 'high' },
      },
      1500,
    );
    expect(updated.rows).toBe(workspace.rows);
    expect(updated.columns.map((c) => c.id)).toEqual(
      workspace.columns.map((c) => c.id),
    );
    expect(updated.columns.at(-1)).toMatchObject({
      ...column,
      title: 'Hiring research',
      prompt: 'Find hiring plans at {{account}}',
      researchProvider: 'codex',
      outputFields: [
        { id: 'research', title: 'Hiring research', valueType: 'text' },
      ],
      codexResearch: { model: 'gpt-5.5', reasoningEffort: 'high' },
    });
    expect(updated.schedule).toMatchObject({
      enabled: false,
      state: 'paused',
      updatedAt: 1500,
    });
    expect(findColumnDependencies(updated, 'company')).toContainEqual({
      ownerId: 'research',
      ownerTitle: 'Hiring research',
      relationship: 'recipe input',
    });
    expect(workspace.schedule?.enabled).toBe(true);
    expect(
      researchSettingsChanged(column, { ...column, codexResearch: {} }),
    ).toBe(true);
  });
  it('keeps schedules running for name-only edits and preserves exact no-ops', () => {
    const workspace = fixture(),
      column = workspace.columns.at(-1)!;
    expect(updateResearchColumnSettings(workspace, column.id, column)).toBe(
      workspace,
    );
    const updated = updateResearchColumnSettings(workspace, column.id, {
      ...column,
      title: 'New name',
    });
    expect(updated.schedule).toBe(workspace.schedule);
    expect(
      researchSettingsChanged(column, {
        ...column,
        codexResearch: { reasoningEffort: 'high' },
      }),
    ).toBe(true);
  });
  it('rejects empty or oversized prompts, missing research columns, and duplicate names', () => {
    const workspace = fixture(),
      column = workspace.columns.at(-1)!;
    for (const prompt of ['', ' '.repeat(10), 'a'.repeat(4001)]) {
      expect(() =>
        updateResearchColumnSettings(workspace, column.id, {
          ...column,
          prompt,
        }),
      ).toThrow('between 1 and 4,000');
    }
    expect(() =>
      updateResearchColumnSettings(workspace, 'company', column),
    ).toThrow('existing research');
    expect(() =>
      updateResearchColumnSettings(workspace, column.id, {
        ...column,
        title: 'Company',
      }),
    ).toThrow('already uses');
  });
});
