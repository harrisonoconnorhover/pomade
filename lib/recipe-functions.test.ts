import { describe, expect, it, vi } from 'vitest';
import { createTable } from './workbook';
import {
  createRecipeFunction,
  instantiateRecipeFunction,
  functionStepIds,
} from './recipe-functions';
import { createRecipeTemplate } from './recipe-templates';
import { executeRecipePipeline } from './recipe-pipeline';
import {
  createHttpColumns,
  executeHttpRecipe,
  httpConnections,
} from './http-enrichment';
import { countMaximumExternalActions } from './external-recipes';

function fixture() {
  const workspace = createTable({
    id: 'source',
    name: 'Source',
    mode: 'empty',
  });
  workspace.columns.splice(
    -1,
    0,
    {
      id: 'normalized',
      title: 'Normalized',
      kind: 'formula',
      recipe: 'normalize-domain',
      width: 160,
    },
    {
      id: 'label',
      title: 'Label',
      kind: 'formula',
      recipe: 'custom-formula',
      expression: '{{normalized | upper}}',
      width: 160,
    },
  );
  workspace.rows = [
    {
      id: 'one',
      values: {
        domain: 'https://www.example.com',
        normalized: 'stale.invalid',
      },
    },
  ];
  return workspace;
}

describe('reusable recipe functions', () => {
  it('maps external inputs and chained outputs despite destination collisions', async () => {
    const workspace = fixture();
    const definition = createRecipeFunction(
      workspace,
      ['label', 'normalized'],
      { id: 'f', name: 'Normalize and label' },
    );
    expect(definition.inputs.map((i) => i.sourceColumnId)).toEqual(['domain']);
    const added = instantiateRecipeFunction(definition, workspace, {
      domain: 'domain',
    });
    workspace.columns.splice(-1, 0, ...added);
    const ids = functionStepIds(
      workspace.columns,
      added[0].functionInstance!.id,
    );
    expect(added[1].inputBindings?.normalized).toBe(added[0].id);
    expect(added[0].id).not.toBe('normalized');
    const result = await executeRecipePipeline(
      workspace,
      ['one'],
      ids,
      {},
      vi.fn(),
    );
    expect(result.workspace.rows[0].values[added[1].id]).toBe('EXAMPLE.COM');
    expect(result.workspace.rows[0].values.normalized).toBe('stale.invalid');
    expect(result.run.receipts.map((r) => r.columnId)).toEqual(ids);
  });

  it('carries structured HTTP outputs and dependent conditions into a copied chain', async () => {
    const source = fixture();
    source.columns = source.columns.filter((c) => c.id !== 'label');
    const http = createHttpColumns(source, {
      id: 'api',
      title: 'API',
      connectionId: 'fixture',
      method: 'GET',
      pathTemplate: '/enrich?domain={{normalized}}',
      outputs: [
        { title: 'Value', path: 'value' },
        { title: 'Tier', path: 'tier' },
      ],
    });
    source.columns.splice(-1, 0, ...http, {
      id: 'after',
      title: 'After',
      kind: 'formula',
      recipe: 'custom-formula',
      expression: '{{api | upper}}',
      runCondition: { field: http[1].id, operator: 'equals', value: 'growth' },
      width: 160,
    });
    const definition = createRecipeFunction(
      source,
      ['normalized', 'api', 'after'],
      { id: 'f', name: 'API chain' },
    );
    const target = createTable({
      id: 'destination',
      name: 'Destination',
      mode: 'empty',
    });
    target.rows = [
      { id: 'one', values: { company: 'https://www.mapped.com' } },
    ];
    const added = instantiateRecipeFunction(definition, target, {
      domain: 'company',
    });
    target.columns.splice(-1, 0, ...added);
    const primary = added.filter((c) => c.functionInstance);
    const second = primary[1];
    expect(primary[2].runCondition?.field).toBe(second.outputFields![1].id);
    expect(countMaximumExternalActions(target.rows, primary)).toBe(1);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      expect(
        new URL(input instanceof Request ? input.url : input).searchParams.get(
          'domain',
        ),
      ).toBe('mapped.com');
      return Response.json({ value: 'ready', tier: 'growth' });
    });
    const connections = httpConnections(
      '{"fixture":{"origin":"https://fixture.example"}}',
    );
    const result = await executeRecipePipeline(
      target,
      undefined,
      primary.map((c) => c.id),
      {},
      (w, id, c) => executeHttpRecipe(w, id, c, connections, fetcher),
    );
    expect(result.workspace.rows[0].values[primary[2].id]).toBe('READY');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects missing input maps and forward dependencies', () => {
    const workspace = fixture();
    const definition = createRecipeFunction(
      workspace,
      ['normalized', 'label'],
      { id: 'f', name: 'Chain' },
    );
    expect(() => instantiateRecipeFunction(definition, workspace, {})).toThrow(
      'needs an input column',
    );
    workspace.columns.reverse();
    expect(() =>
      createRecipeFunction(workspace, ['normalized', 'label'], {
        id: 'f',
        name: 'Chain',
      }),
    ).toThrow('before its producing step');
  });

  it('rejects single-step and list-expanding functions', () => {
    const workspace = fixture();
    expect(() =>
      createRecipeFunction(workspace, ['normalized'], {
        id: 'f',
        name: 'Chain',
      }),
    ).toThrow('two to ten');
    workspace.columns.find((c) => c.id === 'label')!.outputCardinality = 'list';
    expect(() =>
      createRecipeFunction(workspace, ['normalized', 'label'], {
        id: 'f',
        name: 'Chain',
      }),
    ).toThrow('separate table stage');
  });

  it('detects broken groups and gives each copy its own membership', () => {
    const workspace = fixture();
    const definition = createRecipeFunction(
      workspace,
      ['normalized', 'label'],
      { id: 'f', name: 'Chain' },
    );
    const first = instantiateRecipeFunction(definition, workspace, {
      domain: 'domain',
    });
    workspace.columns.push(...first);
    const second = instantiateRecipeFunction(definition, workspace, {
      domain: 'domain',
    });
    expect(second[0].functionInstance!.id).not.toBe(
      first[0].functionInstance!.id,
    );
    expect(() =>
      functionStepIds(first.slice(1), first[0].functionInstance!.id),
    ).toThrow('removed or reordered');
    expect(() =>
      functionStepIds([...first].reverse(), first[0].functionInstance!.id),
    ).toThrow('removed or reordered');
    const template = createRecipeTemplate(first[0], workspace.columns, {
      id: 'single',
      name: 'Single',
    });
    expect(template.column.functionInstance).toBeUndefined();
  });
});
