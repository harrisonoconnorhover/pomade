import { describe, expect, it } from 'vitest';
import { executeWorkspace } from './local-recipe-engine';
import { createSampleWorkspace } from './sample-workspace';

describe('synthetic cleanup starter', () => {
  it('runs only local formulas, retains unknowns and repeats without changing inputs or adding rows', () => {
    const starter = createSampleWorkspace();
    const before = structuredClone(starter);
    expect(
      starter.columns
        .filter((c) => c.recipe)
        .every((c) => c.kind === 'formula'),
    ).toBe(true);
    expect(
      starter.rows.every(
        (r) => r.values.normalized_domain === '' && r.values.contact_key === '',
      ),
    ).toBe(true);

    const { workspace, run } = executeWorkspace(starter);
    expect(
      workspace.rows.map((r) => [
        r.values.normalized_domain,
        r.values.first_name,
        r.values.contact_key,
        r.values.status,
      ]),
    ).toEqual([
      ['aster.example', 'Maya', 'person:maya chen|aster.example', 'Ready'],
      ['birch.example', 'Rowan', 'person:rowan patel|birch.example', 'Ready'],
      ['', 'Lee', '', 'Review'],
    ]);
    expect(run).toMatchObject({
      rowCount: 3,
      actionCount: 9,
      externalWrites: 0,
      reviewCount: 1,
    });
    expect(
      run.receipts.find(
        (r) => r.rowId === 'sample-1' && r.columnId === 'normalized_domain',
      ),
    ).toMatchObject({ before: '', after: 'aster.example', status: 'passed' });
    expect(executeWorkspace(workspace).workspace.rows).toEqual(workspace.rows);
    expect(starter).toEqual(before);
    expect(createSampleWorkspace().rows).toEqual(before.rows);
  });
});
