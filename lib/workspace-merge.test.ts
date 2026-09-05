import { describe, it, expect } from 'vitest';
import { createTable } from './workbook';
import { mergeWorkspaceEdits } from './workspace-merge';
const base = () => ({
  ...createTable({ id: 't', name: 'Table', mode: 'empty' }),
  rows: [{ id: 'a', values: { company: 'Old', domain: 'old.test' } }],
  revision: 1,
});
describe('concurrent table edits', () => {
  it('keeps local edits and remote webhook additions', () => {
    const b = base(),
      l = structuredClone(b),
      r = structuredClone(b);
    l.rows[0].values.company = 'Edited';
    r.rows.push({
      id: 'webhook',
      values: { company: 'Incoming', domain: 'new.test' },
    });
    r.revision = 2;
    const merged = mergeWorkspaceEdits(b, l, r);
    expect(merged.rows).toHaveLength(2);
    expect(merged.rows[0].values.company).toBe('Edited');
    expect(merged.revision).toBe(2);
  });
  it('merges different cells on the same row', () => {
    const b = base(),
      l = structuredClone(b),
      r = structuredClone(b);
    l.rows[0].values.company = 'Local';
    r.rows[0].values.domain = 'remote.test';
    expect(mergeWorkspaceEdits(b, l, r).rows[0].values).toEqual({
      company: 'Local',
      domain: 'remote.test',
    });
  });
  it('rejects conflicting cells and deletion versus edit', () => {
    const b = base(),
      l = structuredClone(b),
      r = structuredClone(b);
    l.rows[0].values.company = 'Local';
    r.rows[0].values.company = 'Remote';
    expect(() => mergeWorkspaceEdits(b, l, r)).toThrow('Save conflict');
    l.rows = [];
    expect(() => mergeWorkspaceEdits(b, l, r)).toThrow();
  });
  it('preserves intentional deletion and independent additions', () => {
    const b = base(),
      l = structuredClone(b),
      r = structuredClone(b);
    l.rows = [];
    r.rows.push({ id: 'new', values: { company: 'New', domain: 'new.test' } });
    expect(mergeWorkspaceEdits(b, l, r).rows.map((row) => row.id)).toEqual([
      'new',
    ]);
  });
});
