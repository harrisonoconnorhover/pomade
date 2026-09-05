import { describe, expect, it } from 'vitest';

import { createSampleWorkspace } from './sample-workspace';
import { createSavedView, rowMatchesSavedView } from './saved-views';

describe('saved views', () => {
  it('creates a bounded persistent filter', () => {
    const workspace = createSampleWorkspace();
    const view = createSavedView(workspace, {
      id: 'view-1',
      name: '  Strong targets  ',
      columnId: 'fit',
      operator: 'contains',
      value: ' strong ',
      now: 1_000,
    });

    expect(view).toEqual({
      id: 'view-1',
      name: 'Strong targets',
      columnId: 'fit',
      operator: 'contains',
      value: 'strong',
      createdAt: 1_000,
    });
    expect(rowMatchesSavedView(workspace.rows[0], view)).toBe(true);
    expect(rowMatchesSavedView(workspace.rows[3], view)).toBe(false);
  });

  it('supports empty and negative filters without case sensitivity', () => {
    const workspace = createSampleWorkspace();
    const row = workspace.rows[0];

    expect(
      rowMatchesSavedView(row, {
        id: 'view-1',
        name: 'No email',
        columnId: 'email',
        operator: 'is_empty',
        createdAt: 1,
      }),
    ).toBe(true);
    expect(
      rowMatchesSavedView(row, {
        id: 'view-2',
        name: 'Not review',
        columnId: 'status',
        operator: 'not_equals',
        value: 'review',
        createdAt: 1,
      }),
    ).toBe(true);
  });

  it('rejects duplicate names, missing columns, and empty comparisons', () => {
    const workspace = createSampleWorkspace();
    workspace.savedViews = [
      {
        id: 'existing',
        name: 'Priority',
        columnId: 'fit',
        operator: 'is_not_empty',
        createdAt: 1,
      },
    ];

    expect(() =>
      createSavedView(workspace, {
        id: 'duplicate',
        name: 'priority',
        columnId: 'fit',
        operator: 'is_not_empty',
      }),
    ).toThrow('already uses that name');
    expect(() =>
      createSavedView(workspace, {
        id: 'missing-column',
        name: 'Missing',
        columnId: 'gone',
        operator: 'is_empty',
      }),
    ).toThrow('still exists');
    expect(() =>
      createSavedView(workspace, {
        id: 'missing-value',
        name: 'No comparison',
        columnId: 'fit',
        operator: 'contains',
      }),
    ).toThrow('comparison value');
  });
});
