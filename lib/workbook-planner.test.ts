import { describe, expect, it } from 'vitest';
import {
  compileWorkbookPlan,
  parseWorkbookPlanAnswer,
  workbookPlanningPrompt,
  DEMANDDRIVE_EXAMPLE,
  type WorkbookPlan,
} from './workbook-planner';
import { applyWebResearchResult } from './web-research';
import { planTableTransfer } from './table-transfer';
import { executeRecipePipeline } from './recipe-pipeline';
import { recalculateAutomaticFormulas } from './local-recipe-engine';
import { findColumnDependencies } from './column-management';
import { createWorkbookTemplate } from './workbook-template';
import { createTable, summarizeTable, relatedWorkbookTables } from './workbook';
const id = '12345678-1234-4234-8234-123456789012';
const text = (id: string) => ({ id, title: id, valueType: 'text' as const });
const number = (id: string) => ({
  id,
  title: id,
  valueType: 'number' as const,
});
function fixture(): WorkbookPlan {
  return {
    name: 'Evidence-led prospects',
    summary: 'Discover accounts, research evidence, and score them.',
    assumptions: [],
    manualTasks: ['Record and share the walkthrough separately.'],
    tables: [
      {
        key: 'discovery',
        name: 'Discovery',
        purpose: 'Find candidate accounts.',
        inputs: [],
        steps: [
          {
            kind: 'research',
            id: 'find',
            title: 'Find accounts',
            prompt: 'Find three companies matching {{brief}}.',
            outputs: [text('company'), text('domain')],
            mode: 'list',
            limit: 3,
          },
        ],
      },
      {
        key: 'accounts',
        name: 'Accounts',
        purpose: 'Research and rank accounts.',
        inputs: [text('company'), text('domain')],
        steps: [
          {
            kind: 'research',
            id: 'evidence',
            title: 'Three signal scores',
            prompt:
              'Research {{company}} at {{domain}} using a 45/30/25 point evidence rubric.',
            outputs: [number('eol'), number('risk'), number('timing')],
            mode: 'record',
            limit: 1,
          },
          {
            kind: 'score',
            id: 'fit',
            title: 'Fit score',
            inputs: [
              { field: 'eol', maxPoints: 45, minimumPoints: 35 },
              { field: 'risk', maxPoints: 30 },
              { field: 'timing', maxPoints: 25 },
            ],
            mediumAt: 60,
            highAt: 85,
          },
        ],
      },
    ],
    transfers: [
      {
        from: 'discovery',
        to: 'accounts',
        name: 'Send candidate accounts',
        childRecipeId: 'find',
        sourceKey: 'domain',
        targetKey: 'domain',
        mapping: { company: 'company' },
      },
    ],
  };
}
describe('prompt-to-workbook', () => {
  it('creates new linked sheets, runnable columns and a persisted ordered guide without inventing researched rows', () => {
    const { tables, steps } = compileWorkbookPlan(
      fixture(),
      DEMANDDRIVE_EXAMPLE,
      id,
    );
    expect(tables[0].rows).toHaveLength(1);
    expect(tables[0].rows[0].values.brief).toBe(DEMANDDRIVE_EXAMPLE);
    expect(tables[1].rows).toEqual([]);
    expect(tables[0].tableTransfers?.[0].targetTableId).toBe(tables[1].id);
    expect(steps.map((s) => s.columnId ?? s.transferId)).toEqual([
      'find',
      'route_0',
      'evidence',
      'fit',
    ]);
    expect(tables.every((t) => !t.schedule && t.columns.length <= 100)).toBe(
      true,
    );
    expect(tables[1].workbookPlan?.manualTasks).toHaveLength(1);
    expect(
      compileWorkbookPlan(fixture(), 'Another brief', crypto.randomUUID())
        .tables[0].id,
    ).not.toBe(tables[0].id);
  });
  it('carries list results through a saved route, then computes a real evidence score through the existing pipeline', async () => {
    const { tables } = compileWorkbookPlan(
      fixture(),
      'Find 3 suitable companies',
      id,
    );
    const list = tables[0].columns.find((c) => c.id === 'find')!;
    const discovered = applyWebResearchResult(
      tables[0],
      tables[0].rows[0].id,
      list,
      {
        answer: JSON.stringify([{ company: 'Example', domain: 'example.com' }]),
        citations: [{ url: 'https://example.com', title: 'Example' }],
        queries: [],
        model: 'test',
        cached: false,
      },
      Date.now(),
    );
    const routed = planTableTransfer(
      discovered.workspace,
      tables[1],
      tables[0].tableTransfers![0],
    );
    expect(routed.added).toBe(1);
    expect(routed.target.rows[0].sourceRecord?.tableId).toBe(tables[0].id);
    const run = await executeRecipePipeline(
      routed.target,
      undefined,
      undefined,
      {},
      async (workspace, rowId, column) =>
        applyWebResearchResult(
          workspace,
          rowId,
          column,
          {
            answer: '{"eol":45,"risk":30,"timing":25}',
            citations: [],
            queries: [],
            model: 'test',
            cached: false,
          },
          Date.now(),
        ),
    );
    expect(run.workspace.rows[0].values).toMatchObject({
      fit: '100',
      fit_tier: 'High',
      fit_reason: '',
    });
    expect(run.run.receipts.map((r) => r.columnId)).toEqual([
      'evidence',
      'fit',
    ]);
    expect(
      planTableTransfer(
        discovered.workspace,
        run.workspace,
        tables[0].tableTransfers![0],
      ).added,
    ).toBe(0);
  });
  it('holds missing, invalid, and below-gate evidence for review while accepting a legitimate zero', () => {
    const table = compileWorkbookPlan(fixture(), 'Find accounts', id).tables[1];
    const calculate = (values: Record<string, string>) =>
      recalculateAutomaticFormulas({ id: 'test', values }, table.columns)
        .values;
    expect(calculate({ eol: '', risk: '30', timing: '25' })).toMatchObject({
      fit: '',
      fit_tier: 'Review',
    });
    expect(calculate({ eol: '46', risk: '30', timing: '25' })).toMatchObject({
      fit: '',
      fit_tier: 'Review',
    });
    expect(calculate({ eol: '20', risk: '30', timing: '25' })).toMatchObject({
      fit: '',
      fit_tier: 'Review',
    });
    expect(calculate({ eol: '45', risk: '0', timing: '25' })).toMatchObject({
      fit: '70',
      fit_tier: 'Medium',
    });
    expect(calculate({ eol: '35', risk: '0', timing: '0' })).toMatchObject({
      fit: '35',
      fit_tier: 'Low',
    });
    expect(findColumnDependencies(table, 'eol')).toEqual(
      expect.arrayContaining([expect.objectContaining({ ownerId: 'fit' })]),
    );
    expect(findColumnDependencies(table, 'fit_tier')).toEqual(
      expect.arrayContaining([expect.objectContaining({ ownerId: 'fit' })]),
    );
  });
  it('rejects incomplete references, cyclic routing and a misleading scoring denominator', () => {
    const broken = fixture();
    broken.tables[1].steps[0] = {
      ...broken.tables[1].steps[0],
      prompt: 'Research {{missing_field}} in detail.',
    } as (typeof broken.tables)[1]['steps'][0];
    expect(() => compileWorkbookPlan(broken, 'Request', id)).toThrow(
      'unknown input',
    );
    const cycle = fixture();
    cycle.transfers[0].from = 'accounts';
    cycle.transfers[0].to = 'discovery';
    expect(() => compileWorkbookPlan(cycle, 'Request', id)).toThrow('earlier');
    const score = fixture();
    const step = score.tables[1].steps[1];
    if (step.kind === 'score') step.inputs[0].maxPoints = 44;
    expect(() => compileWorkbookPlan(score, 'Request', id)).toThrow(
      '100 points',
    );
    const missing = fixture();
    missing.transfers = [];
    expect(() => compileWorkbookPlan(missing, 'Request', id)).toThrow(
      'incoming route',
    );
  });
  it('parses provider wrappers without accepting partial JSON or executable steps', () => {
    expect(
      parseWorkbookPlanAnswer(
        '```json\n' +
          JSON.stringify({ plan: JSON.stringify(fixture()) }) +
          '\n```\nSources: [1]',
      ),
    ).toEqual(fixture());
    expect(parseWorkbookPlanAnswer(JSON.stringify(fixture()))).toEqual(
      fixture(),
    );
    const withoutRecordLimit = JSON.parse(JSON.stringify(fixture()));
    delete withoutRecordLimit.tables[1].steps[0].limit;
    expect(
      parseWorkbookPlanAnswer(JSON.stringify(withoutRecordLimit)).tables[1]
        .steps[0],
    ).toMatchObject({ kind: 'research', mode: 'record', limit: 1 });
    expect(() => parseWorkbookPlanAnswer('{"plan":"{')).toThrow('incomplete');
    const arbitrary = fixture() as unknown as {
      tables: { steps: unknown[] }[];
    };
    arbitrary.tables[0].steps[0] = { kind: 'shell', command: 'echo unsafe' };
    expect(() =>
      parseWorkbookPlanAnswer(
        JSON.stringify({ plan: JSON.stringify(arbitrary) }),
      ),
    ).toThrow('revision');
    expect(workbookPlanningPrompt(DEMANDDRIVE_EXAMPLE).length).toBeLessThan(
      8000,
    );
  });
  it('does not copy a private request or navigation back to original tables into duplicate/template workbooks', () => {
    const tables = compileWorkbookPlan(
      fixture(),
      'Private customer instructions',
      id,
    ).tables;
    expect(
      createWorkbookTemplate(tables, 'Reusable structure').tables.every(
        (t) => !t.workbookPlan,
      ),
    ).toBe(true);
    expect(
      createTable({
        id: 'copy',
        name: 'Copy',
        mode: 'duplicate',
        source: tables[0],
      }).workbookPlan,
    ).toBeUndefined();
  });
});

describe('related workbook navigation', () => {
  it('publishes only lightweight membership and follows plan order with current sheet names', () => {
    const { tables: workspaces } = compileWorkbookPlan(
      fixture(),
      DEMANDDRIVE_EXAMPLE,
      id,
    );
    const summaries = workspaces.map(summarizeTable);
    const active = summaries[0];
    const renamed = summaries.map((table, index) =>
      index === 1 ? { ...table, name: 'Renamed accounts' } : table,
    );
    const related = relatedWorkbookTables([...renamed].reverse(), active.id);
    expect(related.map((table) => table.id)).toEqual(
      workspaces[0].workbookPlan!.tables.map((table) => table.id),
    );
    expect(related[1].name).toBe('Renamed accounts');
    expect(active.workbook).toEqual({
      id,
      name: fixture().name,
      tableIds: summaries.map((table) => table.id),
    });
    expect(JSON.stringify(active)).not.toContain('assumptions');
    expect(JSON.stringify(active)).not.toContain('request');
  });
  it('excludes unavailable or unrelated sheets and removes tabs from standalone copies', () => {
    const { tables: workspaces } = compileWorkbookPlan(
      fixture(),
      DEMANDDRIVE_EXAMPLE,
      id,
    );
    const summaries = workspaces.map(summarizeTable);
    const active = summaries[0];
    const foreign = {
      ...summaries[1],
      workbook: { ...summaries[1].workbook!, id: 'other-account-workbook' },
    };
    expect(relatedWorkbookTables([active, foreign], active.id)).toEqual([]);
    expect(relatedWorkbookTables([active], active.id)).toEqual([]);
    const copy = summarizeTable(
      createTable({
        id: 'copy',
        name: 'Copy',
        mode: 'duplicate',
        source: workspaces[0],
      }),
    );
    expect(copy.workbook).toBeUndefined();
    expect(relatedWorkbookTables([...summaries, copy], copy.id)).toEqual([]);
  });
});
