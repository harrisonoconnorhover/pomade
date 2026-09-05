import { describe, it, expect, vi } from 'vitest';
import {
  createProviderWaterfall,
  executeProviderWaterfall,
} from './provider-waterfall';
import { createTable } from './workbook';
import { executeRecipePipeline } from './recipe-pipeline';
import { countMaximumExternalActions } from './external-recipes';
import { summarizeRecentUsage } from './usage-summary';
import {
  createRecipeTemplate,
  instantiateRecipeTemplate,
} from './recipe-templates';
import { findColumnDependencies } from './column-management';
const connections: import('./http-enrichment').HttpConnection[] = [
  {
    id: 'first',
    label: 'First',
    origin: 'https://one.test',
    methods: ['GET'] as ('GET' | 'POST')[],
    headers: { Authorization: 'Bearer secret' },
  },
  {
    id: 'second',
    label: 'Second',
    origin: 'https://two.test',
    methods: ['GET'] as ('GET' | 'POST')[],
    headers: {},
  },
];
function fixture() {
  const w = createTable({ id: 't', name: 'Table', mode: 'empty' });
  w.rows = [
    {
      id: 'a',
      values: { company: 'Example', domain: 'example.com', result: 'stale' },
    },
  ];
  const columns = createProviderWaterfall(w, {
    id: 'result',
    title: 'Result',
    steps: connections.map((c) => ({
      connectionId: c.id,
      method: 'GET',
      pathTemplate: '/find?domain={{domain}}',
      responsePath: 'email',
    })),
    accept: 'email',
    continueOnError: false,
  });
  w.columns.splice(-1, 0, ...columns);
  return { w, column: columns[0] };
}
describe('provider waterfall', () => {
  it('stops at the first accepted result, without contacting fallback', async () => {
    const { w, column } = fixture();
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ email: 'ada@example.com' }));
    const r = await executeProviderWaterfall(w, 'a', column, connections, f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.receipt.status).toBe('passed');
    expect(r.receipt.attempts).toHaveLength(1);
    expect(r.workspace.rows[0].values.result_provider).toBe('First');
    expect(JSON.stringify(r)).not.toContain('Bearer secret');
  });
  it('tries a second provider after an invalid value and counts real attempts', async () => {
    const { w } = fixture();
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ email: 'not-an-email' }))
      .mockResolvedValueOnce(Response.json({ email: 'ada@example.com' }));
    const r = await executeRecipePipeline(
      w,
      undefined,
      undefined,
      {},
      (w, id, c) => executeProviderWaterfall(w, id, c, connections, f),
    );
    expect(r.run.receipts[0].attempts?.map((a) => a.status)).toEqual([
      'review',
      'passed',
    ]);
    expect(r.workspace.rows[0].values.result_provider).toBe('Second');
    expect(summarizeRecentUsage([r.run])).toMatchObject({
      actionCount: 1,
      providerActionCount: 2,
      unreportedProviderActionCount: 2,
      localActionCount: 0,
    });
    expect(r.run.externalWrites).toBe('unknown');
  });
  it('clears stale values and leaves an ordinary review if every provider misses', async () => {
    const { w, column } = fixture();
    const f = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ email: '' }));
    const r = await executeProviderWaterfall(w, 'a', column, connections, f);
    expect(r.workspace.rows[0].values.result).toBe('');
    expect(r.workspace.rows[0].values.result_provider).toBe('');
    expect(r.receipt.error).toBeUndefined();
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('stops on technical errors unless continuing is configured', async () => {
    const { w, column } = fixture();
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    const r = await executeProviderWaterfall(w, 'a', column, connections, f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.receipt.error).toContain('429');
    column.providerWaterfall!.continueOnError = true;
    const g = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ email: 'ada@example.com' }));
    const recovered = await executeProviderWaterfall(
      w,
      'a',
      column,
      connections,
      g,
    );
    expect(g).toHaveBeenCalledTimes(2);
    expect(recovered.receipt.error).toBeUndefined();
    expect(recovered.receipt.attempts?.[0].error).toContain('429');
  });
  it('bounds the maximum request scope and skips false conditions', async () => {
    const { w, column } = fixture();
    expect(countMaximumExternalActions(w.rows, w.columns)).toBe(2);
    column.runCondition = {
      field: 'company',
      operator: 'equals',
      value: 'Skip',
    };
    const external = vi.fn();
    const r = await executeRecipePipeline(
      w,
      undefined,
      undefined,
      {},
      external,
    );
    expect(external).not.toHaveBeenCalled();
    expect(r.run.skippedCount).toBe(1);
  });
  it('remaps templates and protects request inputs from deletion', async () => {
    const { w, column } = fixture();
    expect(findColumnDependencies(w, 'domain')).toContainEqual(
      expect.objectContaining({
        ownerId: column.id,
        relationship: 'recipe input',
      }),
    );
    const template = createRecipeTemplate(column, w.columns, {
      id: 'template',
      name: 'Fallback',
    });
    const mapped = instantiateRecipeTemplate(template, w.columns, {
      domain: 'company',
    });
    expect(mapped[0].providerWaterfall?.winnerColumnId).toBe(mapped[1].id);
    expect(mapped[0].providerWaterfall?.statusColumnId).toBe(mapped[2].id);
    const f = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      expect(
        new URL(input instanceof Request ? input.url : input).searchParams.get(
          'domain',
        ),
      ).toBe('Example');
      return Response.json({ email: 'ada@example.com' });
    });
    await executeProviderWaterfall(w, 'a', mapped[0], connections, f);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
