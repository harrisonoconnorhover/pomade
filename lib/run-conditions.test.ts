import { describe, expect, it, vi } from 'vitest';
import { matchesRunCondition, validRunCondition } from './run-conditions';
import { createTable } from './workbook';
import { executeRecipePipeline } from './recipe-pipeline';
import {
  createHttpColumns,
  executeHttpRecipe,
  httpConnections,
} from './http-enrichment';
import {
  createRecipeTemplate,
  instantiateRecipeTemplate,
} from './recipe-templates';
import { exportRecipeFile, importRecipeFile } from './recipe-file';
import { findColumnDependencies } from './column-management';
import { planTableTransfer } from './table-transfer';
import type { RecipeRunCondition } from './pomade-types';

const condition: RecipeRunCondition = {
  mode: 'all',
  rules: [
    { field: 'employees', operator: 'greater_than', value: '50' },
    { field: 'fit', operator: 'equals', value: 'High' },
  ],
};
const row = (employees: string, fit = 'High') => ({
  id: employees + fit,
  values: { employees, fit },
});

describe('qualification conditions', () => {
  it('requires both a numeric headcount over 50 and high fit, with OR available explicitly', () => {
    expect(matchesRunCondition(condition, row('51', ' high '))).toBe(true);
    for (const invalid of ['50', '', '51-100', '$100', 'NaN', 'Infinity'])
      expect(matchesRunCondition(condition, row(invalid))).toBe(false);
    expect(matchesRunCondition(condition, row('100', 'Low'))).toBe(false);
    expect(matchesRunCondition({ ...condition, mode: 'any' }, row('10'))).toBe(
      true,
    );
    expect(
      matchesRunCondition(
        { field: 'employees', operator: 'greater_than_or_equal', value: '50' },
        row('50'),
      ),
    ).toBe(true);
    expect(
      matchesRunCondition(
        { field: 'employees', operator: 'less_than_or_equal', value: '50' },
        row('50'),
      ),
    ).toBe(true);
    expect(
      matchesRunCondition(
        { field: 'employees', operator: 'less_than', value: '50' },
        row('50'),
      ),
    ).toBe(false);
    expect(validRunCondition({ mode: 'all', rules: [] })).toBe(false);
  });

  it('calls an external provider only for qualifying rows in the real pipeline', async () => {
    const workspace = createTable({
      id: 'gates',
      name: 'Gates',
      mode: 'empty',
    });
    workspace.rows = [row('51'), row('50'), row('100', 'Low'), row('')];
    const columns = createHttpColumns(workspace, {
      id: 'mobile',
      title: 'Mobile',
      connectionId: 'api',
      method: 'GET',
      pathTemplate: '/mobile',
      outputs: [{ title: 'Mobile', path: 'phone' }],
    });
    columns[0].runCondition = condition;
    workspace.columns.push(...columns);
    const connections = httpConnections(
      '{"api":{"origin":"https://api.example.com"}}',
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ phone: '+12025550123' }));
    const result = await executeRecipePipeline(
      workspace,
      undefined,
      ['mobile'],
      {},
      (table, id, column) =>
        executeHttpRecipe(table, id, column, connections, fetcher),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.run.skippedCount).toBe(3);
    expect(result.workspace.rows[0].values.mobile).toBe('+12025550123');
  });

  it('preserves and remaps every gate through portable templates and reports all dependencies', () => {
    const workspace = createTable({
      id: 'gates',
      name: 'Gates',
      mode: 'empty',
    });
    workspace.columns.push({
      id: 'fit',
      title: 'Fit',
      kind: 'text',
      width: 160,
    });
    workspace.columns.push({
      id: 'employees',
      title: 'Employees',
      kind: 'text',
      width: 160,
    });
    const column = {
      id: 'qualified',
      title: 'Qualified',
      kind: 'formula' as const,
      width: 160,
      recipe: 'custom-formula' as const,
      expression: 'yes',
      runCondition: structuredClone(condition),
    };
    workspace.columns.push(column);
    for (const field of ['employees', 'fit'])
      expect(findColumnDependencies(workspace, field)).toContainEqual(
        expect.objectContaining({
          ownerTitle: 'Qualified',
          relationship: 'run condition',
        }),
      );
    const template = importRecipeFile(
      exportRecipeFile(
        createRecipeTemplate(column, workspace.columns, {
          id: 'g',
          name: 'Qualification',
        }),
      ),
      'copy',
    );
    const target = [
      {
        id: 'headcount',
        title: 'Headcount',
        kind: 'text' as const,
        width: 160,
      },
      { id: 'tier', title: 'Tier', kind: 'text' as const, width: 160 },
    ];
    const bindings = Object.fromEntries(
      template.inputs.map((i) => [
        i.key,
        i.sourceColumnId === 'employees' ? 'headcount' : 'tier',
      ]),
    );
    const [added] = instantiateRecipeTemplate(template, target, bindings);
    expect(added.runCondition).toEqual({
      mode: 'all',
      rules: [
        { field: 'headcount', operator: 'greater_than', value: '50' },
        { field: 'tier', operator: 'equals', value: 'High' },
      ],
    });
    expect(column.runCondition).toEqual(condition);
  });

  it('uses the same compound qualification before table routing', () => {
    const workspace = createTable({
      id: 'gates',
      name: 'Gates',
      mode: 'empty',
    });
    workspace.columns.push({
      id: 'fit',
      title: 'Fit',
      kind: 'text',
      width: 160,
    });
    workspace.columns.push({
      id: 'employees',
      title: 'Employees',
      kind: 'text',
      width: 160,
    });
    workspace.rows = [row('51'), row('50'), row('100', 'Low')].map((r, i) => ({
      ...r,
      values: {
        ...r.values,
        domain: `example${i}.com`,
        company: `Company ${i}`,
      },
    }));
    const target = createTable({ id: 'target', name: 'Target', mode: 'empty' });
    const plan = planTableTransfer(workspace, target, {
      id: 'qualified',
      name: 'Qualified',
      targetTableId: target.id,
      sourceKey: 'domain',
      targetKey: 'domain',
      normalization: 'domain',
      mode: 'upsert',
      skipBlank: true,
      mapping: { company: 'company' },
      condition,
    });
    expect(plan).toMatchObject({ added: 1, skipped: 2 });
    expect(plan.target.rows[0].values.company).toBe('Company 0');
  });
});
