import { describe, expect, it } from 'vitest';

import {
  addWorkspaceDataColumn,
  moveWorkspaceColumn,
  resizeWorkspaceColumn,
} from './grid-columns';
import { createSampleWorkspace } from './sample-workspace';

describe('grid column layout', () => {
  it('persists bounded column widths', () => {
    const workspace = createSampleWorkspace();
    const resized = resizeWorkspaceColumn(workspace, 'company', 247.6);
    const minimum = resizeWorkspaceColumn(resized, 'person', 20);
    const maximum = resizeWorkspaceColumn(minimum, 'title', 900);

    expect(resized.columns[0].width).toBe(248);
    expect(minimum.columns[1].width).toBe(80);
    expect(maximum.columns[2].width).toBe(500);
    expect(workspace.columns[0].width).toBe(170);
  });

  it('reorders ordinary columns without changing recipe execution order', () => {
    const workspace = createSampleWorkspace();
    const moved = moveWorkspaceColumn(workspace, 0, 3);

    expect(moved.columns.slice(0, 4).map((column) => column.id)).toEqual([
      'person',
      'title',
      'domain',
      'company',
    ]);
    expect(
      moved.columns
        .filter(
          (column) => column.kind === 'formula' || column.kind === 'enrichment',
        )
        .map((column) => column.id),
    ).toEqual(['fit', 'opener']);
  });

  it('keeps status anchored and prevents recipe reordering', () => {
    const workspace = createSampleWorkspace();

    expect(() => moveWorkspaceColumn(workspace, 6, 0)).toThrow('anchored');
    expect(() => moveWorkspaceColumn(workspace, 4, 5)).toThrow(
      'execution order',
    );
  });
});

describe('adding ordinary data columns', () => {
  it('adds an empty typed field before run status without touching existing values or recipes', () => {
    const workspace = createSampleWorkspace();
    const added = addWorkspaceDataColumn(
      workspace,
      { id: 'revenue_band', title: '  Revenue   band ', valueType: 'number' },
      123,
    );
    expect(added.columns.slice(-2).map((column) => column.id)).toEqual([
      'revenue_band',
      'status',
    ]);
    expect(added.columns.at(-2)).toMatchObject({
      kind: 'text',
      valueType: 'number',
      title: 'Revenue band',
    });
    expect(
      added.columns.filter((column) => column.id !== 'revenue_band'),
    ).toEqual(workspace.columns);
    expect(added.rows).toEqual(
      workspace.rows.map((row) => ({
        ...row,
        values: { ...row.values, revenue_band: '' },
      })),
    );
    expect(workspace.rows[0].values).not.toHaveProperty('revenue_band');
    expect(added.schedule).toEqual(workspace.schedule);
    expect(added.updatedAt).toBe(123);
  });

  it('also works in a sheet without a run-status column', () => {
    const workspace = { ...createSampleWorkspace(), columns: [], rows: [] };
    const added = addWorkspaceDataColumn(workspace, {
      id: 'notes',
      title: 'Notes',
      valueType: 'text',
    });
    expect(added.columns.map((column) => column.id)).toEqual(['notes']);
    expect(added.rows).toEqual([]);
  });

  it('rejects blank names and collisions so a new field cannot overwrite existing data', () => {
    const workspace = createSampleWorkspace();
    const field = { id: 'extra', title: 'Notes', valueType: 'text' as const };
    expect(() =>
      addWorkspaceDataColumn(workspace, { ...field, title: '  ' }),
    ).toThrow('column name');
    expect(() =>
      addWorkspaceDataColumn(workspace, { ...field, title: ' COMPANY ' }),
    ).toThrow('name');
    expect(() =>
      addWorkspaceDataColumn(workspace, { ...field, id: 'company' }),
    ).toThrow('ID');
  });
});
