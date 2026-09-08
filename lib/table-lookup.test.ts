import { describe, expect, it } from 'vitest';
import { createTable } from './workbook';
import {
  aggregateLookupValues,
  createLookupColumns,
  createLookupResolver,
  normalizeLookupKey,
  suggestLookupNormalization,
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
  it.each([
    ['sum', '2.5'],
    ['average', '1.25'],
    ['min', '-2'],
    ['max', '4.5'],
  ] as const)(
    'rolls up %s and preserves it in mapped templates',
    (mode, expected) => {
      const { source, target } = fixture();
      source.rows = ['4.5', '-2', '  '].map((title, i) => ({
        id: String(i),
        values: { domain: 'example.com', title },
      }));
      const columns = createLookupColumns(target, source, {
        id: 'rollup',
        matchColumnId: 'domain',
        sourceMatchColumnId: 'domain',
        sourceOutputIds: ['title'],
        normalization: 'domain',
        resultMode: mode,
      });
      expect(columns[0].valueType).toBe('number');
      const template = createRecipeTemplate(
        columns[0],
        [...target.columns, ...columns],
        { id: 'tpl', name: 'Rollup' },
      );
      const mapped = instantiateRecipeTemplate(template, target.columns, {
        match: 'domain',
      });
      target.columns.push(...mapped);
      const result = executeWorkspace(target, ['p1'], [mapped[0].id], {
        [source.id]: source,
      });
      expect(result.workspace.rows[0].values[mapped[0].id]).toBe(expected);
      expect(result.run.receipts[0].status).toBe('passed');
      expect(mapped[0].lookup?.resultMode).toBe(mode);
      const empty = createLookupResolver(mapped[0], source)(target.rows[1]);
      expect(empty.passed).toBe(mode === 'sum');
      expect(empty.values[mapped[0].id]).toBe(mode === 'sum' ? '0' : '');
    },
  );
  it('clears every output when a matching numeric field contains invalid text', () => {
    const { source, target } = fixture();
    source.rows[0].values.title = '$10';
    source.rows[0].values.company = '20';
    const columns = createLookupColumns(target, source, {
      id: 'rollup',
      matchColumnId: 'domain',
      sourceMatchColumnId: 'domain',
      sourceOutputIds: ['company', 'title'],
      normalization: 'domain',
      resultMode: 'sum',
    });
    expect(
      createLookupResolver(columns[0], source)(target.rows[0]),
    ).toMatchObject({ passed: false, values: { rollup: '', rollup_1: '' } });
  });
  it('handles decimal presentation, blanks, range limits and groups above the list limit', () => {
    expect(aggregateLookupValues(['0.1', '0.2'], 'sum').value).toBe('0.3');
    expect(aggregateLookupValues(['1e308', '1e308'], 'average').value).toBe(
      '1e+308',
    );
    expect(() => aggregateLookupValues(['1e308', '1e308'], 'sum')).toThrow(
      'range',
    );
    expect(aggregateLookupValues([' ', ''], 'sum').value).toBe('0');
    for (const mode of ['average', 'min', 'max'] as const)
      expect(() => aggregateLookupValues([' '], mode)).toThrow('No numeric');
    for (const value of ['NaN', 'Infinity', '10%', '1,000', '0x10'])
      expect(() => aggregateLookupValues([value], 'sum')).toThrow(
        'Non-numeric',
      );
    const { source, target } = fixture();
    source.rows = Array.from({ length: 101 }, (_, i) => ({
      id: String(i),
      values: { domain: 'example.com', title: '2' },
    }));
    const columns = createLookupColumns(target, source, {
      id: 'rollup',
      matchColumnId: 'domain',
      sourceMatchColumnId: 'domain',
      sourceOutputIds: ['title'],
      normalization: 'domain',
      resultMode: 'sum',
    });
    expect(
      createLookupResolver(columns[0], source)(target.rows[0]),
    ).toMatchObject({ passed: true, values: { rollup: '202' } });
  });
  it('collects contains matches in source order with duplicate values and blanks', () => {
    const { source, target } = fixture();
    source.rows = [
      { id: 'a', values: { company: 'Acme North', title: 'Leader' } },
      { id: 'b', values: { company: 'Acme South', title: '' } },
      { id: 'c', values: { company: 'Acme North', title: 'Leader' } },
    ];
    const columns = createLookupColumns(target, source, {
      id: 'many',
      matchColumnId: 'company',
      sourceMatchColumnId: 'company',
      sourceOutputIds: ['title'],
      normalization: 'text',
      comparison: 'contains',
      resultMode: 'list',
    });
    const result = createLookupResolver(
      columns[0],
      source,
    )({ id: 'q', values: { company: ' ACME ' } });
    expect(result.passed).toBe(true);
    expect(JSON.parse(result.values.many)).toEqual(['Leader', '', 'Leader']);
    expect(result.evidence).toContain('Source row: b');
  });
  it('counts all matches including zero without requiring output-field selection', () => {
    const { source, target } = fixture();
    source.rows.push({ ...source.rows[0], id: 'c2' });
    const columns = createLookupColumns(target, source, {
      id: 'count',
      matchColumnId: 'domain',
      sourceMatchColumnId: 'domain',
      sourceOutputIds: [],
      normalization: 'domain',
      resultMode: 'count',
    });
    expect(columns[0].valueType).toBe('number');
    expect(columns).toHaveLength(2);
    const resolve = createLookupResolver(columns[0], source);
    expect(resolve(target.rows[0]).values.count).toBe('2');
    expect(resolve(target.rows[1])).toMatchObject({
      passed: true,
      values: { count: '0' },
    });
    expect(resolve({ id: 'blank', values: {} })).toMatchObject({
      passed: false,
      values: { count: '' },
    });
  });
  it('keeps legacy unique matching and directionally applies contains', () => {
    const { source, target, columns } = fixture();
    source.rows.push({ ...source.rows[0], id: 'c2' });
    delete columns[0].lookup!.comparison;
    delete columns[0].lookup!.resultMode;
    expect(
      createLookupResolver(columns[0], source)(target.rows[0]).passed,
    ).toBe(false);
    const c = createLookupColumns(target, source, {
      id: 'contains',
      matchColumnId: 'company',
      sourceMatchColumnId: 'company',
      sourceOutputIds: ['title'],
      normalization: 'text',
      comparison: 'contains',
      resultMode: 'count',
    });
    const resolve = createLookupResolver(c[0], source);
    expect(
      resolve({ id: 'x', values: { company: 'Example extended' } }).values
        .contains,
    ).toBe('0');
    expect(
      resolve({ id: 'x', values: { company: 'amp' } }).values.contains,
    ).toBe('2');
  });
  it('returns empty lists for no matches and refuses truncated successful lists', () => {
    const { source, target } = fixture();
    const c = createLookupColumns(target, source, {
      id: 'list',
      matchColumnId: 'domain',
      sourceMatchColumnId: 'domain',
      sourceOutputIds: ['title'],
      normalization: 'domain',
      resultMode: 'list',
    });
    expect(createLookupResolver(c[0], source)(target.rows[1])).toMatchObject({
      passed: true,
      values: { list: '[]' },
    });
    source.rows = Array.from({ length: 101 }, (_, i) => ({
      ...source.rows[0],
      id: String(i),
    }));
    const oversized = createLookupResolver(c[0], source)(target.rows[0]);
    expect(oversized.passed).toBe(false);
    expect(oversized.values.list).toBe('');
    source.rows = [
      { id: 'big', values: { domain: 'example.com', title: 'x'.repeat(4001) } },
    ];
    expect(createLookupResolver(c[0], source)(target.rows[0]).values.list).toBe(
      '',
    );
  });
  it('retains multi-match behavior in templates and downstream local runs', () => {
    const { source, target } = fixture();
    const c = createLookupColumns(target, source, {
      id: 'total',
      matchColumnId: 'domain',
      sourceMatchColumnId: 'domain',
      sourceOutputIds: [],
      normalization: 'domain',
      resultMode: 'count',
    });
    target.columns.push(...c);
    const template = createRecipeTemplate(c[0], target.columns, {
      id: 'tpl',
      name: 'Count',
    });
    const mapped = instantiateRecipeTemplate(template, target.columns, {
      match: 'domain',
    });
    expect(mapped[0].lookup?.resultMode).toBe('count');
    expect(mapped[0].lookup?.statusColumnId).toBe(mapped[1].id);
    const result = executeWorkspace(target, ['p1'], ['total'], {
      [source.id]: source,
    });
    expect(result.workspace.rows[0].values.total).toBe('1');
  });

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

describe('automatic lookup matching', () => {
  it('uses domain matching only when both selected fields clearly represent websites', () => {
    expect(
      suggestLookupNormalization(
        { id: 'domain', title: 'Company domain' },
        { id: 'website_url', title: 'Website' },
      ),
    ).toBe('domain');
    expect(
      suggestLookupNormalization(
        { id: 'company', title: 'Company' },
        { id: 'company', title: 'Company' },
      ),
    ).toBe('text');
    expect(
      suggestLookupNormalization(
        { id: 'email', title: 'Email' },
        { id: 'email', title: 'Email' },
      ),
    ).toBe('text');
    expect(
      suggestLookupNormalization(
        { id: 'domain', title: 'Domain' },
        { id: 'email', title: 'Email' },
      ),
    ).toBe('text');
    expect(
      suggestLookupNormalization(
        { id: 'linkedin_url', title: 'LinkedIn URL' },
        { id: 'linkedin_url', title: 'LinkedIn URL' },
      ),
    ).toBe('text');
  });
});
