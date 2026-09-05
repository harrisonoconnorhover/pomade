import { describe, expect, it, vi } from 'vitest';
import { createTable } from './workbook';
import {
  createHttpColumns,
  executeHttpRecipe,
  httpConnections,
} from './http-enrichment';
import { executeRecipePipeline } from './recipe-pipeline';
import { countMaximumExternalActions } from './external-recipes';

function workingFixture() {
  const workspace = createTable({
    id: 'pipeline',
    name: 'Pipeline',
    mode: 'empty',
  });
  workspace.rows = [
    {
      id: 'one',
      values: {
        company: 'Example',
        domain: 'https://www.example.com',
        person: 'Ada',
      },
    },
  ];
  workspace.columns.splice(-1, 0, {
    id: 'normalized',
    title: 'Normalized',
    kind: 'formula',
    recipe: 'normalize-domain',
    width: 160,
  });
  const http = createHttpColumns(workspace, {
    id: 'api',
    title: 'API',
    connectionId: 'api',
    method: 'GET',
    pathTemplate: '/enrich?domain={{normalized}}',
    outputs: [{ title: 'Value', path: 'value' }],
  });
  workspace.columns.splice(-1, 0, ...http, {
    id: 'after',
    title: 'After',
    kind: 'formula',
    recipe: 'custom-formula',
    expression: '{{api | upper}}',
    width: 160,
  });
  return { workspace, http };
}
const connections = httpConnections(
  '{"api":{"origin":"https://api.example.com"}}',
);
describe('column-ordered recipe pipeline', () => {
  it('runs local input → HTTP → downstream formula exactly once in table order', async () => {
    const { workspace } = workingFixture();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      expect(
        new URL(input instanceof Request ? input.url : input).searchParams.get(
          'domain',
        ),
      ).toBe('example.com');
      return Response.json({ value: 'growth' });
    });
    const result = await executeRecipePipeline(
      workspace,
      undefined,
      undefined,
      {},
      (table, id, column) =>
        executeHttpRecipe(table, id, column, connections, fetcher),
    );
    expect(result.workspace.rows[0].values.after).toBe('GROWTH');
    expect(result.run.receipts.map((r) => r.columnId)).toEqual([
      'normalized',
      'api',
      'after',
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses a maximum bound even when a downstream condition is initially false', async () => {
    const { workspace } = workingFixture();
    const next = createHttpColumns(workspace, {
      id: 'next',
      title: 'Next',
      connectionId: 'api',
      method: 'GET',
      pathTemplate: '/next',
      outputs: [{ title: 'Value', path: 'value' }],
    });
    next[0].runCondition = { field: 'api', operator: 'equals', value: 'yes' };
    workspace.columns.splice(-1, 0, ...next);
    expect(countMaximumExternalActions(workspace.rows, workspace.columns)).toBe(
      2,
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ value: 'yes' }))
      .mockResolvedValueOnce(Response.json({ value: 'done' }));
    const result = await executeRecipePipeline(
      workspace,
      undefined,
      undefined,
      {},
      (table, id, column) =>
        executeHttpRecipe(table, id, column, connections, fetcher),
    );
    expect(result.workspace.rows[0].values.next).toBe('done');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('preserves successful rows and review flags when another HTTP row fails', async () => {
    const { workspace } = workingFixture();
    workspace.rows.push({
      id: 'two',
      values: { company: 'Other', domain: 'other.com' },
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ value: 'good' }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    const result = await executeRecipePipeline(
      workspace,
      undefined,
      undefined,
      {},
      (table, id, column) =>
        executeHttpRecipe(table, id, column, connections, fetcher),
    );
    expect(result.workspace.rows[0].values.after).toBe('GOOD');
    expect(result.workspace.rows[1].values.status).toBe('Review');
    expect(result.run.reviewCount).toBeGreaterThan(0);
  });
  it('honors column scope and skips all provider calls for false conditions', async () => {
    const { workspace, http } = workingFixture();
    http[0].runCondition = {
      field: 'company',
      operator: 'equals',
      value: 'Skip',
    };
    workspace.rows[0].values.status = 'Review';
    const external = vi.fn();
    const result = await executeRecipePipeline(
      workspace,
      ['one'],
      ['api'],
      {},
      external,
    );
    expect(external).not.toHaveBeenCalled();
    expect(result.run.skippedCount).toBe(1);
    expect(result.workspace.rows[0].values.status).toBe('Review');
  });
});
