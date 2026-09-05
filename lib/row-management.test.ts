import { describe, expect, it } from 'vitest';

import { createRecipeSchedule } from './recipe-schedule';
import { deleteWorkspaceRows } from './row-management';
import { createSampleWorkspace } from './sample-workspace';

describe('row management', () => {
  it('deletes selected rows and all generated descendants', () => {
    const workspace = createSampleWorkspace();
    workspace.rows.splice(
      1,
      0,
      {
        id: 'child-1',
        parentRowId: 'sample-1',
        generatedByColumnId: 'people',
        values: { company: 'Mercury', status: 'Ready' },
      },
      {
        id: 'grandchild-1',
        parentRowId: 'child-1',
        generatedByColumnId: 'research',
        values: { company: 'Mercury', status: 'Ready' },
      },
    );

    const result = deleteWorkspaceRows(workspace, ['sample-1'], 1_000);

    expect(result.removedCount).toBe(3);
    expect(result.workspace.rows.map((row) => row.id)).not.toContain('child-1');
    expect(result.workspace.rows.map((row) => row.id)).not.toContain(
      'grandchild-1',
    );
    expect(result.workspace.updatedAt).toBe(1_000);
  });

  it('prunes a captured schedule and pauses when its scope becomes empty', () => {
    const workspace = createSampleWorkspace();
    workspace.schedule = createRecipeSchedule({
      id: 'schedule-1',
      cadence: 'every_day',
      rowIds: ['sample-1'],
      nextRunAt: 50_000,
      now: 500,
    });

    const result = deleteWorkspaceRows(workspace, ['sample-1'], 1_000);

    expect(result.schedulePaused).toBe(true);
    expect(result.workspace.schedule).toMatchObject({
      enabled: false,
      state: 'paused',
      rowIds: [],
      updatedAt: 1_000,
    });
  });

  it('does not mutate the workspace when no requested row exists', () => {
    const workspace = createSampleWorkspace();
    const result = deleteWorkspaceRows(workspace, ['missing']);

    expect(result.removedCount).toBe(0);
    expect(result.workspace).toBe(workspace);
  });
});
