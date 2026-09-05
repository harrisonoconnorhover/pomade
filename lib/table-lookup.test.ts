import { describe, expect, it } from 'vitest';
import { createTable } from './workbook';
import {
  createLookupColumns,
  createLookupResolver,
  normalizeLookupKey,
} from './table-lookup';
import { executeWorkspace } from './local-recipe-engine';
import {
  createRecipeTemplate,
  instantiateRecipeTemplate,
} from './recipe-templates';
import { findColumnDependencies } from './column-management';

function fixture() {
  const source = createTable({
    id: 'companies',
    name: 'Companies',
    mode: 'empty',
    now: 1,
  });
  source.rows = [
    {
      id: 'c1',
      values: {
        domain: 'https://www.example.com/about',
        company: 'Example',
        title: 'Enterprise',
      },
    },
  ];
  const target = createTable({
    id: 'people',
    name: 'People',
    mode: 'empty',
    now: 1,
  });
  target.rows = [
    {
      id: 'p1',
      values: { company: 'Example', domain: 'EXAMPLE.COM', person: 'Ada' },
    },
    { id: 'p2', values: { company: 'Other', domain: 'other.com' } },
  ];
  const columns = createLookupColumns(target, source, {
    id: 'lookup',
    matchColumnId: 'domain',
    sourceMatchColumnId: 'domain',
    sourceOutputIds: ['company', 'title'],
    normalization: 'domain',
  });
  target.columns.splice(-1, 0, ...columns);
  return { source, target, columns };
}

describe('table lookup recipes', () => {
  it('matches normalized domains once, returns multiple fields, and feeds a later formula', () => {
    const { source, target } = fixture();
    target.columns.splice(-1, 0, {
      id: 'label',
      title: 'Label',
      width: 200,
      kind: 'formula',
      recipe: 'custom-formula',
      expression: '{{lookup}} — {{lookup_1}}',
    });
    const result = executeWorkspace(target, ['p1'], undefined, {
      companies: source,
    });
    expect(result.workspace.rows[0].values).toMatchObject({
      lookup: 'Example',
      lookup_1: 'Enterprise',
      lookup_match: 'Matched',
      label: 'Example — Enterprise',
    });
    expect(result.run.receipts[0]).toMatchObject({
      provider: 'local',
      status: 'passed',
      evidence: expect.arrayContaining(['Source row: c1']),
    });
    expect(result.workspace.rows[1]).toEqual(target.rows[1]);
    expect(source.rows[0].values.company).toBe('Example');
  });

  it('clears stale results instead of choosing a duplicate or retaining a missing match', () => {
    const { source, target, columns } = fixture();
    target.rows[0].values.lookup = 'Stale';
    source.rows.push({
      id: 'c2',
      values: { domain: 'example.com', company: 'Different' },
    });
    let result = executeWorkspace(target, undefined, undefined, {
      companies: source,
    });
    expect(result.workspace.rows[0].values).toMatchObject({
      lookup: '',
      lookup_1: '',
      lookup_match: 'Multiple matches (2)',
      status: 'Review',
    });
    expect(result.workspace.rows[1].values.lookup_match).toBe('No match');
    expect(
      result.run.receipts.every((receipt) => receipt.status === 'review'),
    ).toBe(true);
    const resolve = createLookupResolver(columns[0], source);
    expect(resolve({ id: 'empty', values: {} }).values.lookup_match).toBe(
      'Missing match value',
    );
    source.rows = [];
    result = executeWorkspace(target, ['p1'], undefined, { companies: source });
    expect(result.workspace.rows[0].values.lookup_match).toBe('No match');
  });

  it('records missing source tables or columns and picks up fresh saved data on rerun', () => {
    const { source, target } = fixture();
    expect(executeWorkspace(target).workspace.rows[0].values.lookup_match).toBe(
      'Source table unavailable',
    );
    const changed = structuredClone(source);
    changed.columns = changed.columns.filter((column) => column.id !== 'title');
    expect(
      executeWorkspace(target, undefined, undefined, { companies: changed })
        .workspace.rows[0].values.lookup_match,
    ).toBe('Source column unavailable');
    source.rows[0].values.title = 'SMB';
    expect(
      executeWorkspace(target, undefined, undefined, { companies: source })
        .workspace.rows[0].values.lookup_1,
    ).toBe('SMB');
  });

  it('respects recipe conditions and selected-column scope', () => {
    const { source, target, columns } = fixture();
    columns[0].runCondition = {
      field: 'company',
      operator: 'equals',
      value: 'Other',
    };
    const result = executeWorkspace(target, undefined, [columns[0].id], {
      companies: source,
    });
    expect(result.run.skippedCount).toBe(1);
    expect(result.run.actionCount).toBe(1);
    expect(result.workspace.rows[0].values.lookup).toBeUndefined();
    expect(
      executeWorkspace(target, undefined, [], { companies: source }).run
        .actionCount,
    ).toBe(0);
  });

  it('remaps saved template inputs and outputs without changing its source contract', () => {
    const { source, target, columns } = fixture();
    const template = createRecipeTemplate(columns[0], target.columns, {
      id: 'saved',
      name: 'Company fields',
    });
    const added = instantiateRecipeTemplate(template, target.columns, {
      match: 'domain',
    });
    expect(added[0].lookup?.sourceTableId).toBe(source.id);
    expect(added[0].lookup?.outputs[0].outputColumnId).toBe(added[0].id);
    expect(added[0].lookup?.statusColumnId).toBe(added[2].id);
    expect(
      createLookupResolver(added[0], source)(target.rows[0]).values[
        added[0].id
      ],
    ).toBe('Example');
    expect(findColumnDependencies(target, 'domain')).toContainEqual(
      expect.objectContaining({
        ownerId: 'lookup',
        relationship: 'recipe input',
      }),
    );
    expect(findColumnDependencies(target, 'lookup_match')).toContainEqual(
      expect.objectContaining({
        ownerId: 'lookup',
        relationship: 'structured output',
      }),
    );
  });

  it('keeps exact text distinct while normalizing domain URLs and ordinary text predictably', () => {
    expect(normalizeLookupKey(' Acme ', 'text')).toBe('acme');
    expect(normalizeLookupKey(' Acme ', 'exact')).toBe(' Acme ');
    expect(normalizeLookupKey('https://WWW.EXAMPLE.com/a?q=x', 'domain')).toBe(
      'example.com',
    );
    expect(normalizeLookupKey('employee@example.com', 'domain')).toBe('');
    expect(normalizeLookupKey('not a domain', 'domain')).toBe('');
  });
});
