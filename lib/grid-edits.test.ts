import { describe, expect, it } from 'vitest';
import { createSampleWorkspace } from './legacy-workspace.test-support';
import { applyGridEdits, visibleSelection } from './grid-edits';
import { createSampleWorkspace as createCleanupWorkspace } from './sample-workspace';
import { executeWorkspace } from './local-recipe-engine';
import { workspaceCsv } from './csv-import';

describe('spreadsheet edits and visible selection', () => {
  it('marks changed inputs as Draft without erasing outputs or unrelated values', () => {
    const { workspace } = executeWorkspace(createCleanupWorkspace());
    const first = workspace.rows[0];
    const edited = applyGridEdits(
      workspace,
      [{ ...first, values: { ...first.values, domain: '' } }],
      'domain',
    );

    expect(edited.rows[0].values).toEqual({
      ...first.values,
      domain: '',
      status: 'Draft',
    });
    expect(edited.rows[1]).toBe(workspace.rows[1]);
    expect(workspace.rows[0].values.status).toBe('Ready');
    expect(workspaceCsv(edited).split('\r\n')[1]).toBe(
      'Aster Works,Maya Chen,Operations lead,,aster.example,Maya,person:maya chen|aster.example,Draft',
    );

    const rerun = executeWorkspace(edited, [first.id]);
    expect(rerun.workspace.rows[0].values).toMatchObject({
      normalized_domain: '',
      contact_key: '',
      status: 'Review',
    });
    expect(rerun.run.reviewCount).toBe(1);
  });

  it('keeps an unchanged cell edit as a no-op, including status and timestamp', () => {
    const { workspace } = executeWorkspace(createCleanupWorkspace());
    const first = workspace.rows[0];
    expect(
      applyGridEdits(
        workspace,
        [{ ...first, values: { ...first.values } }],
        'domain',
      ),
    ).toBe(workspace);
  });

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
