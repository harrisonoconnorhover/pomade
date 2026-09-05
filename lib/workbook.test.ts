import { describe, expect, it } from 'vitest';
import { createTable } from './workbook';
import { createSampleWorkspace } from './sample-workspace';
import { executeWorkspace } from './local-recipe-engine';
import { deleteWorkspaceRows } from './row-management';

const source = () => createSampleWorkspace();

describe('workbook tables', () => {
  it('creates an empty usable table without sample data or recipes', () => {
    const table = createTable({
      id: 'companies',
      name: ' Companies ',
      mode: 'empty',
      now: 1,
    });
    expect(table.name).toBe('Companies');
    expect(table.rows).toEqual([]);
    expect(table.columns.some((column) => column.recipe)).toBe(false);
    expect(table.columns.map((column) => column.id)).toContain('domain');
  });

  it('duplicates a configured table independently without restarting automation', () => {
    const original = source();
    original.schedule = {
      id: 'schedule',
      cadence: 'every_day',
      enabled: true,
      state: 'running',
      target: 'all',
      confirmExternalResearch: true,
      createdAt: 1,
      updatedAt: 1,
      leaseUntil: 100,
    };
    const copy = createTable({
      id: 'copy',
      name: 'Copy',
      mode: 'duplicate',
      source: original,
    });
    expect(copy.schedule).toBeUndefined();
    expect(executeWorkspace(copy).run.workspaceId).toBe('copy');
    copy.rows[0].values.company = 'Changed';
    copy.columns[0].title = 'Renamed';
    expect(original.rows[0].values.company).not.toBe('Changed');
    expect(original.columns[0].title).not.toBe('Renamed');
    expect(original.schedule.enabled).toBe(true);
  });

  it('copies exactly selected rows with source links and no upstream recipe execution', () => {
    const original = source();
    original.rows[1].parentRowId = original.rows[0].id;
    original.rows[1].generatedByColumnId = 'opener';
    const linked = createTable({
      id: 'people',
      name: 'People',
      mode: 'linked',
      source: original,
      rowIds: [original.rows[1].id],
    });
    expect(linked.rows).toHaveLength(1);
    expect(linked.rows[0]).toMatchObject({
      values: original.rows[1].values,
      sourceRecord: {
        tableId: original.id,
        rowId: original.rows[1].id,
        tableName: original.name,
      },
    });
    expect(linked.rows[0].parentRowId).toBeUndefined();
    expect(linked.columns.every((column) => !column.recipe)).toBe(true);
    expect(executeWorkspace(linked).run.actionCount).toBe(0);
    expect(
      deleteWorkspaceRows(linked, [original.rows[0].id]).workspace.rows,
    ).toHaveLength(1);
  });

  it('rejects missing source rows and invalid names instead of creating partial copies', () => {
    expect(() =>
      createTable({ id: 'test', name: '', mode: 'empty' }),
    ).toThrow();
    expect(() =>
      createTable({ id: 'test', name: 'Test', mode: 'duplicate' }),
    ).toThrow();
    expect(() =>
      createTable({
        id: 'test',
        name: 'Test',
        mode: 'linked',
        source: source(),
        rowIds: ['missing'],
      }),
    ).toThrow('no longer exist');
  });
});
