import { describe, expect, it } from 'vitest';

import {
  deleteWorkspaceColumn,
  findColumnDependencies,
  renameWorkspaceColumn,
} from './column-management';
import { createSampleWorkspace } from './sample-workspace';

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
});
