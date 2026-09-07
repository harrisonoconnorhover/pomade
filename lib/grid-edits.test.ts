import { describe, expect, it } from 'vitest';
import { createSampleWorkspace } from './sample-workspace';
import { applyGridEdits, visibleSelection } from './grid-edits';

describe('spreadsheet edits and visible selection', () => {
  it('merges consecutive stale callbacks and recomputes formulas from the latest values', () => {
    const original = createSampleWorkspace();
    original.columns.push({
      id: 'label',
      title: 'Label',
      kind: 'formula',
      recipe: 'custom-formula',
      expression: '{{person}} at {{company}}',
      autoRun: true,
      width: 200,
    });
    const stale = original.rows[0];
    const first = applyGridEdits(
      original,
      [{ ...stale, values: { ...stale.values, company: 'Pasted company' } }],
      'company',
    );
    const second = applyGridEdits(
      first,
      [{ ...stale, values: { ...stale.values, person: 'Pasted person' } }],
      'person',
    );
    expect(second.rows[0].values).toMatchObject({
      company: 'Pasted company',
      person: 'Pasted person',
      label: 'Pasted person at Pasted company',
    });
    expect(second.rows.slice(1)).toEqual(original.rows.slice(1));
    expect(original.rows[0]).toBe(stale);
    expect(original.rows[0].values.company).not.toBe('Pasted company');
  });
  it('clears several cells without restoring another cleared value', () => {
    const original = createSampleWorkspace();
    const stale = original.rows[0];
    const first = applyGridEdits(
      original,
      [{ ...stale, values: { ...stale.values, company: '' } }],
      'company',
    );
    const second = applyGridEdits(
      first,
      [{ ...stale, values: { ...stale.values, person: '' } }],
      'person',
    );
    expect(second.rows[0].values).toMatchObject({ company: '', person: '' });
    expect(second.rows[0].values.domain).toBe(stale.values.domain);
  });
  it('limits row actions to records in the current view', () => {
    const rows = createSampleWorkspace().rows;
    expect(
      visibleSelection([rows[1]], [rows[0].id, rows[1].id], rows[0].id),
    ).toEqual({ selectedIds: [rows[1].id], active: rows[1] });
    expect(visibleSelection([], [rows[0].id], rows[0].id)).toEqual({
      selectedIds: [],
      active: undefined,
    });
  });
});
