import { describe, expect, it } from 'vitest';

import { executeWorkspace } from './local-recipe-engine';
import { createSampleWorkspace } from './sample-workspace';

describe('single-column run scope', () => {
  it('runs only the requested recipe for only the requested rows', () => {
    const workspace = createSampleWorkspace();
    workspace.rows = workspace.rows.map((row) => ({
      ...row,
      values: { ...row.values, fit: '', opener: '' },
    }));

    const result = executeWorkspace(workspace, ['sample-1'], ['fit']);

    expect(result.run.rowCount).toBe(1);
    expect(result.run.receipts).toHaveLength(1);
    expect(result.run.receipts[0].columnId).toBe('fit');
    expect(result.workspace.rows[0].values.fit).toBeTruthy();
    expect(result.workspace.rows[0].values.opener).toBe('');
    expect(result.workspace.rows[1].values.fit).toBe('');
  });
});
