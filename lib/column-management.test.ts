import { describe, expect, it } from 'vitest';

import { renameWorkspaceColumn } from './column-management';
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
});
