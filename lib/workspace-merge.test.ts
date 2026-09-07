import { describe, it, expect } from 'vitest';
import { createTable } from './workbook';
import {
  mergeWorkspaceEdits,
  reconcileWorkspaceUpdate,
} from './workspace-merge';
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
  it('keeps unsaved cells while accepting a newer job result as the baseline', () => {
    const b = base(),
      l = structuredClone(b),
      r = structuredClone(b);
    l.rows[0].values.company = 'Unsaved company';
    r.rows[0].values.domain = 'job-result.test';
    r.revision = 2;
    const result = reconcileWorkspaceUpdate(b, l, r);
    expect(result.saved).toBe(r);
    expect(result.workspace.rows[0].values).toEqual({
      company: 'Unsaved company',
      domain: 'job-result.test',
    });
    expect(result.workspace).not.toBe(result.saved);
    expect(reconcileWorkspaceUpdate(b, b, r).workspace).toBe(r);
  });
  it('ignores a poll older than a completed save and preserves conflicts', () => {
    const b = base(),
      l = structuredClone(b),
      r = structuredClone(b);
    b.revision = 3;
    r.revision = 2;
    l.rows[0].values.company = 'Local';
    expect(reconcileWorkspaceUpdate(b, l, r)).toEqual({
      saved: b,
      workspace: l,
    });
    r.revision = 4;
    r.rows[0].values.company = 'Other edit';
    expect(() => reconcileWorkspaceUpdate(b, l, r)).toThrow('Save conflict');
    expect(l.rows[0].values.company).toBe('Local');
  });
});
