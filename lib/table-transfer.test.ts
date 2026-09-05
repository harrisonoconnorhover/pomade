import { describe, it, expect } from 'vitest';
import { createTable } from './workbook';
import { planTableTransfer, saveTransferRule } from './table-transfer';
import type { TableTransferRule } from './pomade-types';
const rule: TableTransferRule = {
  id: 'r',
  name: 'Send prospects',
  targetTableId: 'dest',
  sourceKey: 'domain',
  targetKey: 'domain',
  normalization: 'domain',
  mode: 'upsert',
  skipBlank: true,
  mapping: { company: 'company', email: 'email' },
};
function fixture() {
  const source = createTable({ id: 'src', name: 'Source', mode: 'empty' }),
    target = createTable({ id: 'dest', name: 'Destination', mode: 'empty' });
  source.rows = [
    {
      id: 's1',
      values: {
        domain: 'https://www.example.com/about',
        company: 'New company',
        email: '',
      },
    },
    {
      id: 's2',
      values: { domain: 'new.test', company: 'New row', email: 'ada@new.test' },
    },
  ];
  target.rows = [
    {
      id: 't1',
      values: {
        domain: 'EXAMPLE.COM',
        company: 'Old company',
        email: 'keep@example.com',
        title: 'Keep this',
      },
    },
  ];
  return { source, target };
}
describe('repeatable table transfers', () => {
  it('adds and updates normalized matches while preserving unmapped and blank values', () => {
    const { source, target } = fixture();
    const plan = planTableTransfer(source, target, rule);
    expect(plan.added).toBe(1);
    expect(plan.updated).toBe(1);
    expect(plan.target.rows[0].values).toMatchObject({
      company: 'New company',
      email: 'keep@example.com',
      title: 'Keep this',
    });
    expect(plan.target.rows[0].sourceRecord?.rowId).toBe('s1');
    expect(target.rows[0].values.company).toBe('Old company');
    const rerun = planTableTransfer(source, plan.target, rule);
    expect(rerun.added + rerun.updated).toBe(0);
    expect(rerun.skipped).toBe(2);
  });
  it('makes add-only, update-only and explicit blank-clearing modes distinct', () => {
    const { source, target } = fixture();
    expect(
      planTableTransfer(source, target, { ...rule, mode: 'add' }),
    ).toMatchObject({ added: 1, updated: 0, skipped: 1 });
    expect(
      planTableTransfer(source, target, { ...rule, mode: 'update' }),
    ).toMatchObject({ added: 0, updated: 1, skipped: 1 });
    expect(
      planTableTransfer(source, target, { ...rule, skipBlank: false }).target
        .rows[0].values.email,
    ).toBe('');
  });
  it('reviews duplicate source or destination keys without arbitrary writes', () => {
    const { source, target } = fixture();
    source.rows.push({
      id: 'dup',
      values: { domain: 'example.com', company: 'Other' },
    });
    source.rows.push({ id: 'empty', values: { domain: '' } });
    const plan = planTableTransfer(source, target, rule);
    expect(plan.review).toBe(3);
    expect(plan.target.rows[0]).toEqual(target.rows[0]);
    const fresh = fixture();
    fresh.target.rows.push({
      id: 'duplicate',
      values: { domain: 'example.com' },
    });
    expect(
      planTableTransfer(fresh.source, fresh.target, rule, ['s1']).review,
    ).toBe(1);
  });
  it('honors selected rows and refreshes local formulas without provider execution', () => {
    const { source, target } = fixture();
    target.columns.push({
      id: 'upper',
      title: 'Upper',
      width: 100,
      kind: 'formula',
      recipe: 'custom-formula',
      expression: '{{company | upper}}',
      autoRun: true,
    });
    const p = planTableTransfer(source, target, rule, ['s1']);
    expect(p.added).toBe(0);
    expect(p.target.rows[0].values.upper).toBe('NEW COMPANY');
    expect(() =>
      planTableTransfer(source, target, rule, ['missing']),
    ).toThrow();
  });
  it('saves mappings independently and rejects invalid destinations', () => {
    const { source, target } = fixture();
    const saved = saveTransferRule(source, target, rule);
    expect(saved.tableTransfers?.[0]).toEqual(rule);
    expect(source.tableTransfers).toBeUndefined();
    expect(() =>
      planTableTransfer(source, target, {
        ...rule,
        mapping: { status: 'company' },
      }),
    ).toThrow();
    expect(() =>
      planTableTransfer(source, target, { ...rule, targetKey: 'missing' }),
    ).toThrow();
  });
  it('pauses active destination schedules only when data changes', () => {
    const { source, target } = fixture();
    target.schedule = {
      id: 's',
      cadence: 'once',
      enabled: true,
      state: 'active',
      target: 'all',
      nextRunAt: 1,
      createdAt: 1,
      updatedAt: 1,
      confirmExternalResearch: true,
    };
    const p = planTableTransfer(source, target, rule);
    expect(p.target.schedule?.enabled).toBe(false);
    const unchanged = { ...p.target, schedule: target.schedule };
    expect(
      planTableTransfer(source, unchanged, rule).target.schedule?.enabled,
    ).toBe(true);
  });
});

describe('conditional and generated-row routing', () => {
  it('filters before matching keys and records nonmatching rows as skips', () => {
    const { source, target } = fixture();
    source.rows[0].values.title = '  Enterprise  ';
    source.rows[1].values.title = 'Small';
    source.rows[1].values.domain = '';
    const plan = planTableTransfer(source, target, {
      ...rule,
      condition: { field: 'title', operator: 'equals', value: 'enterprise' },
    });
    expect(plan).toMatchObject({ updated: 1, skipped: 1, review: 0 });
    expect(plan.changes.find((c) => c.sourceRowId === 's2')?.reason).toBe(
      'Routing condition did not match',
    );
    expect(() =>
      planTableTransfer(source, target, {
        ...rule,
        condition: { field: 'deleted', operator: 'is_empty' },
      }),
    ).toThrow('condition column');
  });
  it('routes only the selected parents current children from the chosen list recipe', () => {
    const { source, target } = fixture();
    source.columns.push({
      id: 'people',
      title: 'People list',
      kind: 'enrichment',
      recipe: 'web-research',
      outputCardinality: 'list',
      width: 160,
    });
    source.rows.push(
      {
        id: 'c1',
        parentRowId: 's1',
        generatedByColumnId: 'people',
        values: { email: 'one@example.com', company: 'Child one', title: 'VP' },
      },
      {
        id: 'c2',
        parentRowId: 's1',
        generatedByColumnId: 'people',
        values: {
          email: 'two@example.com',
          company: 'Child two',
          title: 'Other',
        },
      },
      {
        id: 'c3',
        parentRowId: 's2',
        generatedByColumnId: 'people',
        values: {
          email: 'three@example.com',
          company: 'Wrong parent',
          title: 'VP',
        },
      },
    );
    const branch = {
      ...rule,
      sourceKey: 'email',
      targetKey: 'email',
      normalization: 'text' as const,
      mapping: { company: 'company' },
      rowScope: 'children' as const,
      childRecipeId: 'people',
      condition: { field: 'title', operator: 'equals' as const, value: 'vp' },
    };
    const plan = planTableTransfer(source, target, branch, ['s1']);
    expect(plan).toMatchObject({ added: 1, skipped: 1, review: 0 });
    expect(plan.changes.map((c) => c.sourceRowId).sort()).toEqual(['c1', 'c2']);
    expect(
      plan.target.rows.find((r) => r.values.email === 'one@example.com')
        ?.sourceRecord?.rowId,
    ).toBe('c1');
    expect(planTableTransfer(source, plan.target, branch, ['s1']).added).toBe(
      0,
    );
    expect(() =>
      planTableTransfer(
        source,
        target,
        { ...branch, childRecipeId: 'missing' },
        ['s1'],
      ),
    ).toThrow('list recipe');
  });
});
