import { describe, expect, it } from 'vitest';

import {
  addWorkspaceDataColumn,
  columnCapacityError,
  moveWorkspaceColumn,
  moveVisibleWorkspaceColumn,
  setWorkspaceColumnHidden,
  showAllWorkspaceColumns,
  resizeWorkspaceColumn,
} from './grid-columns';
import { executeWorkspace } from './local-recipe-engine';
import { mergeWorkspaceEdits } from './workspace-merge';
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

  it('allows the final column and blocks overflow without changing the sheet', () => {
    const workspace = createSampleWorkspace();
    while (workspace.columns.length < 99)
      workspace.columns.splice(-1, 0, {
        id: `field_${workspace.columns.length}`,
        title: `Field ${workspace.columns.length}`,
        kind: 'text',
        width: 120,
      });
    expect(columnCapacityError(workspace, 2)).toContain('only 1 space remains');
    const full = addWorkspaceDataColumn(workspace, {
      id: 'last',
      title: 'Last field',
      valueType: 'text',
    });
    expect(full.columns).toHaveLength(100);
    expect(columnCapacityError(full)).toContain('100-column limit');
    const before = structuredClone(full);
    expect(() =>
      addWorkspaceDataColumn(full, {
        id: 'overflow',
        title: 'Overflow',
        valueType: 'text',
      }),
    ).toThrow('100-column limit');
    expect(full).toEqual(before);
    expect(workspace.columns).toHaveLength(99);
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

describe('column visibility', () => {
  it('preserves hidden inputs and recipe execution, including after serialization', () => {
    const original = createSampleWorkspace();
    const hidden = setWorkspaceColumnHidden(
      setWorkspaceColumnHidden(original, 'company', true),
      'fit',
      true,
    );
    const reloaded = JSON.parse(JSON.stringify(hidden));
    expect(
      reloaded.columns.find((c: { id: string }) => c.id === 'fit').hidden,
    ).toBe(true);
    expect(hidden.rows).toBe(original.rows);
    expect(
      executeWorkspace(reloaded).workspace.rows.map((r) => r.values),
    ).toEqual(executeWorkspace(original).workspace.rows.map((r) => r.values));
    expect(showAllWorkspaceColumns(hidden).columns.map((c) => c.id)).toEqual(
      original.columns.map((c) => c.id),
    );
    expect(
      showAllWorkspaceColumns(hidden).columns.every((c) => !c.hidden),
    ).toBe(true);
  });
  it('moves the displayed column by identity and still protects hidden recipe order', () => {
    const hidden = setWorkspaceColumnHidden(
      createSampleWorkspace(),
      'person',
      true,
    );
    const moved = moveVisibleWorkspaceColumn(hidden, 0, 2);
    expect(
      moved.columns
        .filter((c) => !c.hidden)
        .slice(0, 3)
        .map((c) => c.id),
    ).toEqual(['title', 'domain', 'company']);
    expect(moved.columns.find((c) => c.id === 'person')?.hidden).toBe(true);
    const hiddenRecipe = setWorkspaceColumnHidden(hidden, 'fit', true);
    expect(() => moveVisibleWorkspaceColumn(hiddenRecipe, 3, 0)).toThrow(
      'execution order',
    );
    expect(() => moveVisibleWorkspaceColumn(hidden, 5, 0)).toThrow('anchored');
  });
  it('keeps one visible column and merges visibility with incoming row changes', () => {
    const base = createSampleWorkspace();
    const hidden = base.columns.reduce(
      (w, c) => setWorkspaceColumnHidden(w, c.id, true),
      base,
    );
    expect(hidden.columns.filter((c) => !c.hidden)).toHaveLength(1);
    const incoming = structuredClone(base);
    incoming.rows[0].values.company = 'Updated remotely';
    const merged = mergeWorkspaceEdits(base, hidden, incoming);
    expect(merged.columns).toEqual(hidden.columns);
    expect(merged.rows[0].values.company).toBe('Updated remotely');
  });
});
