import { expect, it, vi } from 'vitest';
import { executeRecipePipeline } from './recipe-pipeline';
import type { WorkspaceSnapshot, PomadeColumn } from './pomade-types';
import { createSampleWorkspace } from './sample-workspace';

it('saves earlier provider work and stops downstream steps when Mac research is pending', async () => {
  const workspace = createSampleWorkspace();
  workspace.rows = [
    {
      id: 'one',
      values: {
        company: 'Example',
        domain: 'example.com',
        research: 'Keep existing research',
      },
    },
  ];
  workspace.columns = ['paid', 'research', 'later'].map((id) => ({
    id,
    title: id,
    width: 200,
    kind: 'enrichment',
    recipe: id === 'research' ? 'web-research' : 'http-api',
  }));
  const external = vi.fn(
    async (
      current: WorkspaceSnapshot,
      rowId: string,
      column: PomadeColumn,
    ) => ({
      workspace:
        column.id === 'paid'
          ? {
              ...current,
              rows: current.rows.map((row) => ({
                ...row,
                values: { ...row.values, paid: 'Found email' },
              })),
            }
          : current,
      receipt: {
        id: column.id,
        rowId,
        rowLabel: 'Example',
        columnId: column.id,
        action: column.title,
        status: 'passed' as const,
        before: '',
        after: column.id === 'paid' ? 'Found email' : 'Keep existing research',
        durationMs: 0,
        pending: column.id === 'research',
        evidence: [],
      },
    }),
  );
  const result = await executeRecipePipeline(
    workspace,
    ['one'],
    undefined,
    {},
    external,
  );
  expect(external.mock.calls.map((call) => call[2].id)).toEqual([
    'paid',
    'research',
  ]);
  expect(result.workspace.rows[0].values.paid).toBe('Found email');
  expect(result.workspace.rows[0].values.research).toBe(
    'Keep existing research',
  );
  expect(result.run.receipts[1].pending).toBe(true);
});
