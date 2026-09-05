import { describe, it, expect } from 'vitest';
import { createTable } from './workbook';
import { detectSignalChanges, saveSignalWatch } from './change-signals';
function fixture() {
  const w = createTable({ id: 'w', name: 'Signals', mode: 'empty' });
  w.rows = [{ id: 'one', values: { company: 'Before', title: 'VP' } }];
  return saveSignalWatch(w, {
    id: 'watch',
    name: 'Company changes',
    columnId: 'company',
    ignoreEmpty: true,
  });
}
const operation = { id: 'op', origin: 'Test' };
describe('change signals', () => {
  it('records observed changes with values and provenance, without mutating snapshots', () => {
    const before = fixture(),
      after = structuredClone(before);
    after.rows[0].values.company = 'After';
    const batch = detectSignalChanges(before, after, operation)!;
    expect(batch).toMatchObject({
      id: 'op',
      workspaceId: 'w',
      origin: 'Test',
      totalChanges: 1,
      omittedChanges: 0,
    });
    expect(batch.events[0]).toMatchObject({
      rowId: 'one',
      watchName: 'Company changes',
      before: 'Before',
      after: 'After',
    });
    expect(before.rows[0].values.company).toBe('Before');
    expect(
      detectSignalChanges(after, after, { ...operation, id: 'next' }),
    ).toBeNull();
  });
  it('uses new rows as baselines and respects ignored blanks, scope and removed watches', () => {
    const before = fixture(),
      after = structuredClone(before);
    after.rows.push({ id: 'new', values: { company: 'New' } });
    expect(detectSignalChanges(before, after, operation)).toBeNull();
    after.rows[0].values.company = '';
    expect(detectSignalChanges(before, after, operation)).toBeNull();
    before.signalWatches![0].ignoreEmpty = false;
    expect(detectSignalChanges(before, after, operation)?.events[0].after).toBe(
      '',
    );
    expect(
      detectSignalChanges(before, after, {
        ...operation,
        columnIds: ['title'],
      }),
    ).toBeNull();
    expect(
      detectSignalChanges(before, after, { ...operation, rowIds: ['new'] }),
    ).toBeNull();
    after.signalWatches = [];
    expect(detectSignalChanges(before, after, operation)).toBeNull();
  });
  it('reports exact change totals when details and long values are bounded', () => {
    const before = fixture();
    before.rows = Array.from({ length: 205 }, (_, i) => ({
      id: String(i),
      values: { company: 'Old' },
    }));
    const after = structuredClone(before);
    after.rows.forEach((r) => {
      r.values.company = 'x'.repeat(600);
    });
    const batch = detectSignalChanges(before, after, operation)!;
    expect(batch.totalChanges).toBe(205);
    expect(batch.omittedChanges).toBe(5);
    expect(batch.events).toHaveLength(200);
    expect(batch.events[0].truncated).toBe(true);
    expect(batch.events[0].after).toHaveLength(500);
  });
  it('validates watched fields and avoids status-only system changes', () => {
    const w = fixture();
    expect(() =>
      saveSignalWatch(w, {
        id: 'bad',
        name: 'Bad',
        columnId: 'status',
        ignoreEmpty: false,
      }),
    ).toThrow('data column');
    const after = structuredClone(w);
    after.rows[0].values.status = 'Review';
    expect(detectSignalChanges(w, after, operation)).toBeNull();
  });
});
