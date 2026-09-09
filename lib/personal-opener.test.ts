import { describe, expect, it, vi } from 'vitest';
import {
  PERSONAL_OPENER_RECIPE,
  prepareResearchRecipe,
} from './research-recipes';
import { instantiateRecipeTemplate } from './recipe-templates';
import { exportRecipeFile, importRecipeFile } from './recipe-file';
import { createTable } from './workbook';
import { executeRecipePipeline } from './recipe-pipeline';
import { ParallelWebResearchClient } from './parallel-client';
import {
  applyWebResearchResult,
  renderWebResearchPrompt,
} from './web-research';
import { countMaximumExternalActions } from './external-recipes';

function fixture() {
  const workspace = createTable({
    id: 'opener',
    name: 'Opener QA',
    mode: 'empty',
  });
  workspace.columns.push(
    { id: 'site_url', title: 'Website', kind: 'text', width: 200 },
    {
      id: 'personal_opener',
      title: 'Personal opener',
      kind: 'enrichment',
      recipe: 'write-opener',
      width: 200,
    },
  );
  workspace.rows = [
    {
      id: 'one',
      values: {
        company: 'Example',
        domain: 'wrong.test',
        site_url: 'example.com',
        person: 'Ada',
        personal_opener: 'Keep this reviewed legacy answer',
      },
    },
    {
      id: 'missing',
      values: {
        company: 'Unknown',
        domain: 'wrong.test',
        site_url: '',
        personal_opener: 'Keep this too',
      },
    },
  ];
  const bindings = {
    company: 'company',
    domain: 'site_url',
    person: 'person',
    title: '',
  };
  const prepared = prepareResearchRecipe(PERSONAL_OPENER_RECIPE, {
    prompt:
      PERSONAL_OPENER_RECIPE.column.prompt + '\nUse a plain, curious tone.',
    focus: 'Relevant to sales operations.',
    provider: 'parallel',
  });
  const imported = importRecipeFile(exportRecipeFile(prepared), 'copy');
  const added = instantiateRecipeTemplate(
    imported,
    workspace.columns,
    bindings,
  );
  const before = structuredClone(workspace);
  workspace.columns.push(...added);
  return { workspace, before, added, column: added[0] };
}

async function runFixture(hasEvidence: boolean) {
  const { workspace, before, added, column } = fixture();
  const output = Object.fromEntries(
    added.map((c, index) => [
      c.id,
      hasEvidence
        ? [
            'Your new routing product caught my attention—how are you helping sales teams put it to work?',
            '“Today we launched our routing product.”',
            'https://example.com/news/routing',
            'Ready',
          ][index]
        : [
            null,
            'No accessible first-party source established a specific fact.',
            null,
            'Insufficient evidence',
          ][index],
    ]),
  );
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_url, init) => {
      if (typeof init?.body !== 'string')
        throw new Error('Expected a JSON request body');
      const body = JSON.parse(init.body);
      const requestText = JSON.stringify(body);
      expect(requestText).toContain('example.com');
      expect(requestText).not.toContain('wrong.test');
      expect(requestText).toContain('Use a plain, curious tone.');
      expect(requestText).toContain('Relevant to sales operations.');
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...output,
                _pomade_citations: hasEvidence
                  ? [
                      {
                        url: 'https://example.com/news/routing',
                        title: 'Routing launch',
                      },
                    ]
                  : [],
              }),
            },
          },
        ],
      });
    });
  const client = new ParallelWebResearchClient({
    apiKey: 'synthetic-only',
    fetchImpl: fetcher,
  });
  const result = await executeRecipePipeline(
    workspace,
    undefined,
    [column.id],
    {},
    async (current, rowId, recipe) => {
      const row = current.rows.find((r) => r.id === rowId)!;
      const answer = await client.research(
        renderWebResearchPrompt(
          recipe.prompt!,
          row,
          recipe.outputFields,
          recipe.inputBindings,
        ),
        recipe.outputFields,
      );
      return applyWebResearchResult(
        current,
        rowId,
        recipe,
        answer,
        Date.now(),
        'parallel',
      );
    },
  );
  return { result, fetcher, before, added, column, output };
}

describe('evidence-backed personal opener', () => {
  it('maps the reusable recipe through the real research client and pipeline, keeps citations, and skips missing websites', async () => {
    const { result, fetcher, before, added, column, output } =
      await runFixture(true);
    expect(column.recipe).toBe('web-research');
    expect(column.researchProvider).toBe('parallel');
    expect(column.autoRun).toBe(false);
    expect(column.id).not.toBe('personal_opener');
    expect(added).toHaveLength(4);
    expect(result.workspace.rows[0].values).toMatchObject(output);
    expect(result.workspace.rows.map((r) => r.values.personal_opener)).toEqual(
      before.rows.map((r) => r.values.personal_opener),
    );
    expect(result.run.receipts[0]).toMatchObject({
      status: 'passed',
      provider: 'parallel',
      references: [
        { title: 'Routing launch', url: 'https://example.com/news/routing' },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.run.skippedCount).toBe(1);
  });

  it('leaves the opener blank and reports insufficient evidence in Review when the provider has no supported fact', async () => {
    const { result, column, added } = await runFixture(false);
    expect(result.workspace.rows[0].values[column.id]).toBe('');
    expect(result.workspace.rows[0].values[added[2].id]).toBe('');
    expect(result.workspace.rows[0].values[added[3].id]).toBe(
      'Insufficient evidence',
    );
    expect(result.run.receipts[0]).toMatchObject({
      status: 'review',
      references: [],
    });
  });

  it('can be configured without a provider, but an attempted research run fails without a request or demo fallback', async () => {
    const { workspace, before, column } = fixture();
    expect(workspace.rows).toEqual(before.rows);
    const fetcher = vi.fn<typeof fetch>();
    const client = new ParallelWebResearchClient({
      apiKey: '',
      fetchImpl: fetcher,
    });
    await expect(
      client.research(column.prompt!, column.outputFields),
    ).rejects.toThrow('Parallel is not configured');
    expect(fetcher).not.toHaveBeenCalled();
    expect(workspace.rows).toEqual(before.rows);
  });

  it('keeps saved legacy opener execution local and requires deliberate adoption of a new column', async () => {
    const { workspace, before, column } = fixture();
    const external = vi.fn();
    expect(
      countMaximumExternalActions(workspace.rows, [before.columns.at(-1)!]),
    ).toBe(0);
    expect(countMaximumExternalActions(workspace.rows, [column])).toBe(2);
    const result = await executeRecipePipeline(
      workspace,
      ['one'],
      ['personal_opener'],
      {},
      external,
    );
    expect(external).not.toHaveBeenCalled();
    expect(result.workspace.rows[0].values.personal_opener).toContain(
      'Ada, Example stands out',
    );
    expect(result.workspace.rows[0].values[column.id]).toBeUndefined();
    expect(before.rows[0].values.personal_opener).toBe(
      'Keep this reviewed legacy answer',
    );
  });

  it('rejects missing mappings and prompt edits that create undeclared inputs or exceed capacity', () => {
    const { workspace } = fixture();
    expect(() =>
      instantiateRecipeTemplate(PERSONAL_OPENER_RECIPE, workspace.columns, {}),
    ).toThrow('input column');
    expect(() =>
      prepareResearchRecipe(PERSONAL_OPENER_RECIPE, {
        prompt: 'Use {{secret_input}}.',
      }),
    ).toThrow('inputs listed');
    expect(() =>
      prepareResearchRecipe(PERSONAL_OPENER_RECIPE, { prompt: ' ' }),
    ).toThrow('Enter a research prompt');
    expect(() =>
      prepareResearchRecipe(PERSONAL_OPENER_RECIPE, {
        prompt: 'x'.repeat(4001),
      }),
    ).toThrow('4,000');
    expect(PERSONAL_OPENER_RECIPE.column.prompt).not.toContain(
      'Use a plain, curious tone.',
    );
  });
});
