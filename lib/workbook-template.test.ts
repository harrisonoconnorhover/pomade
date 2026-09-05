import { describe, it, expect, vi } from 'vitest';
import { createTable } from './workbook';
import {
  createWorkbookTemplate,
  instantiateWorkbookTemplate,
} from './workbook-template';
import { createLookupColumns } from './table-lookup';
import { createRecipeTemplate } from './recipe-templates';
import { executeRecipePipeline } from './recipe-pipeline';
function fixture() {
  const a = createTable({ id: 'a', name: 'Accounts', mode: 'empty' }),
    b = createTable({ id: 'b', name: 'People', mode: 'empty' });
  a.rows = [
    {
      id: 'private',
      values: { company: 'Do not copy', domain: 'example.com' },
    },
  ];
  const lookup = createLookupColumns(b, a, {
    id: 'reference',
    matchColumnId: 'domain',
    sourceMatchColumnId: 'domain',
    sourceOutputIds: ['company'],
    normalization: 'domain',
  });
  b.columns.splice(-1, 0, ...lookup);
  const saved = createRecipeTemplate(lookup[0], b.columns, {
    id: 'saved',
    name: 'Saved lookup',
  });
  b.recipeTemplates = [saved];
  b.recipeFunctions = [
    {
      id: 'function',
      name: 'Reusable',
      createdAt: 1,
      inputs: saved.inputs,
      steps: [saved],
    },
  ];
  a.tableTransfers = [
    {
      id: 'transfer',
      name: 'Send accounts',
      targetTableId: 'b',
      sourceKey: 'domain',
      targetKey: 'domain',
      normalization: 'domain',
      mode: 'upsert',
      mapping: { company: 'company' },
      skipBlank: true,
    },
  ];
  a.schedule = {
    id: 'old-schedule',
    cadence: 'every_day',
    enabled: true,
    state: 'running',
    target: 'selected',
    rowIds: ['private'],
    confirmExternalResearch: true,
    nextRunAt: 99,
    leaseUntil: 999,
    createdAt: 1,
    updatedAt: 1,
    lastRunId: 'old-run',
    afterRunTransfer: a.tableTransfers[0],
  };
  a.webhookMappings = { hook: { company: 'company' } };
  a.webhookAutoImport = { hook: true };
  return { a, b };
}
describe('workbook templates', () => {
  it('captures structures without rows, ingestion bindings or active schedule state', () => {
    const { a, b } = fixture();
    const template = createWorkbookTemplate([a, b], 'Template');
    expect(template.tables[0].rows).toEqual([]);
    expect(template.tables[0].webhookMappings).toBeUndefined();
    expect(template.tables[0].schedule).toMatchObject({
      enabled: false,
      state: 'paused',
    });
    expect(template.tables[0].schedule?.rowIds).toBeUndefined();
    expect(template.tables[0].schedule?.lastRunId).toBeUndefined();
    expect(a.rows).toHaveLength(1);
    expect(a.schedule?.state).toBe('running');
  });
  it('rewires lookups, nested libraries and both transfer references to new tables', async () => {
    const { a, b } = fixture();
    const template = createWorkbookTemplate([a, b], 'Template');
    const [copyA, copyB] = instantiateWorkbookTemplate(
      template,
      'Campaign',
      {},
      [],
    );
    expect(copyA.id).not.toBe(a.id);
    expect(copyB.id).not.toBe(b.id);
    expect(copyA.tableTransfers![0].targetTableId).toBe(copyB.id);
    expect(copyA.schedule?.afterRunTransfer?.targetTableId).toBe(copyB.id);
    expect(copyB.recipeTemplates![0].column.lookup?.sourceTableId).toBe(
      copyA.id,
    );
    expect(
      copyB.recipeFunctions![0].steps[0].column.lookup?.sourceTableId,
    ).toBe(copyA.id);
    copyA.rows = [
      { id: 'new', values: { domain: 'example.com', company: 'New source' } },
    ];
    copyB.rows = [{ id: 'contact', values: { domain: 'example.com' } }];
    const lookup = copyB.columns.find((c) => c.lookup)!;
    const result = await executeRecipePipeline(
      copyB,
      undefined,
      [lookup.id],
      { [copyA.id]: copyA, a },
      vi.fn(),
    );
    expect(result.workspace.rows[0].values[lookup.id]).toBe('New source');
    expect(
      template.tables[1].columns.find((c) => c.lookup)!.lookup?.sourceTableId,
    ).toBe('a');
  });
  it('requires compatible explicit mappings for references outside the template', () => {
    const { a, b } = fixture();
    const template = createWorkbookTemplate([b], 'People only');
    expect(template.externalTableIds).toEqual(['a']);
    expect(() =>
      instantiateWorkbookTemplate(template, 'Copy', {}, [a]),
    ).toThrow('Map each external table');
    const external = { ...a, id: 'other' };
    const [copy] = instantiateWorkbookTemplate(
      template,
      'Copy',
      { a: 'other' },
      [external],
    );
    expect(copy.columns.find((c) => c.lookup)!.lookup?.sourceTableId).toBe(
      'other',
    );
    expect(() =>
      instantiateWorkbookTemplate(template, 'Copy', { a: 'other' }, [
        {
          ...external,
          columns: external.columns.filter((c) => c.id !== 'domain'),
        },
      ]),
    ).toThrow('matching source column IDs');
  });
  it('gives copied function groups fresh IDs and keeps schedule membership connected', () => {
    const { a } = fixture();
    a.tableTransfers = [];
    a.schedule!.afterRunTransfer = undefined;
    a.columns[0].functionInstance = {
      id: 'group',
      definitionId: 'definition',
      name: 'Group',
      step: 0,
      total: 1,
    };
    a.schedule!.functionInstanceId = 'group';
    const template = createWorkbookTemplate([a], 'Group');
    const [one] = instantiateWorkbookTemplate(template, 'One', {}, []),
      [two] = instantiateWorkbookTemplate(template, 'Two', {}, []);
    expect(one.schedule?.functionInstanceId).toBe(
      one.columns[0].functionInstance?.id,
    );
    expect(one.schedule?.functionInstanceId).not.toBe(
      two.schedule?.functionInstanceId,
    );
  });
});
