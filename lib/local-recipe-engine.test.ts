import { describe, expect, it } from 'vitest';

import { toControlTowerPreview } from './control-tower-adapter';
import {
  countEligibleRecipeActions,
  executeWorkspace,
  matchesRunCondition,
  recalculateAutomaticFormulas,
  renderCustomFormula,
  shouldRunRecipe,
} from './local-recipe-engine';
import { createSampleWorkspace } from './sample-workspace';
import { toScoutboundPipeline } from './scoutbound-adapter';

describe('Pomade recipe execution', () => {
  it('does not recursively rerun a list recipe on its own child rows', () => {
    expect(
      shouldRunRecipe(
        {
          id: 'found_company',
          title: 'Company name',
          kind: 'enrichment',
          recipe: 'web-research',
          outputCardinality: 'list',
          width: 240,
        },
        {
          id: 'child-1',
          parentRowId: 'source-1',
          generatedByColumnId: 'found_company',
          values: {},
        },
      ),
    ).toBe(false);
  });

  it('runs every configured recipe and produces a non-writing receipt', () => {
    const workspace = createSampleWorkspace();
    const result = executeWorkspace(workspace);

    expect(result.run.status).toBe('completed');
    expect(result.run.rowCount).toBe(10);
    expect(result.run.actionCount).toBe(20);
    expect(result.run.externalWrites).toBe(0);
    expect(result.workspace.rows[0].values.fit).toMatch(
      /^(Strong|Review) · \d+$/,
    );
    expect(result.workspace.rows[0].values.opener).toContain('Mercury');
  });

  it('can run one recipe column for an explicit row scope', () => {
    const workspace = createSampleWorkspace();
    workspace.rows[0].values.opener = '';
    const result = executeWorkspace(workspace, ['sample-1'], ['fit']);

    expect(result.run.actionCount).toBe(1);
    expect(result.run.receipts[0].columnId).toBe('fit');
    expect(result.workspace.rows[0].values.fit).toMatch(
      /^(Strong|Review) · \d+$/,
    );
    expect(result.workspace.rows[0].values.opener).toBe('');
  });

  it('normalizes a domain through a formula column', () => {
    const workspace = createSampleWorkspace();
    workspace.columns.push({
      id: 'clean_domain',
      title: 'Clean domain',
      kind: 'formula',
      recipe: 'normalize-domain',
      width: 180,
    });
    workspace.rows[0].values.domain = 'HTTPS://WWW.MERCURY.COM/about';

    const result = executeWorkspace(workspace);

    expect(result.workspace.rows[0].values.clean_domain).toBe('mercury.com');
  });

  it('previews row-aware merge formulas without evaluating code', () => {
    const row = createSampleWorkspace().rows[0];

    expect(
      renderCustomFormula(
        '{{ person | first }}, {{ company | upper }} uses {{ domain | domain }}.',
        {
          ...row,
          values: {
            ...row.values,
            domain: 'https://www.Mercury.com/about',
          },
        },
      ),
    ).toBe('Immad, MERCURY uses mercury.com.');
    expect(renderCustomFormula('{{missing}}safe', row)).toBe('safe');
    expect(renderCustomFormula('{{person | unknown}}', row)).toBe(
      'Immad Akhund',
    );
  });

  it('lets a later custom formula use an earlier recipe output', () => {
    const workspace = createSampleWorkspace();
    workspace.columns.splice(
      -1,
      0,
      {
        id: 'clean_domain',
        title: 'Clean domain',
        kind: 'formula',
        recipe: 'normalize-domain',
        width: 180,
      },
      {
        id: 'account_key',
        title: 'Account key',
        kind: 'formula',
        recipe: 'custom-formula',
        expression: '{{company | lower}}::{{clean_domain}}',
        width: 240,
      },
    );
    workspace.rows[0].values.domain = 'HTTPS://WWW.MERCURY.COM/about';

    const result = executeWorkspace(workspace, ['sample-1']);

    expect(result.workspace.rows[0].values.account_key).toBe(
      'mercury::mercury.com',
    );
  });

  it('evaluates row conditions without case sensitivity', () => {
    const row = createSampleWorkspace().rows[0];

    expect(
      matchesRunCondition(
        { field: 'title', operator: 'contains', value: 'FOUNDER' },
        row,
      ),
    ).toBe(true);
    expect(
      matchesRunCondition({ field: 'email', operator: 'is_empty' }, row),
    ).toBe(true);
    expect(
      matchesRunCondition(
        { field: 'company', operator: 'not_equals', value: 'Mercury' },
        row,
      ),
    ).toBe(false);
    expect(
      countEligibleRecipeActions(
        [row],
        [
          {
            id: 'eligible',
            title: 'Eligible',
            kind: 'enrichment',
            recipe: 'company-summary',
            width: 180,
            runCondition: {
              field: 'company',
              operator: 'equals',
              value: 'mercury',
            },
          },
          {
            id: 'ineligible',
            title: 'Ineligible',
            kind: 'enrichment',
            recipe: 'company-summary',
            width: 180,
            runCondition: { field: 'email', operator: 'is_not_empty' },
          },
        ],
      ),
    ).toBe(1);
  });

  it('skips recipe actions when their row condition is false', () => {
    const workspace = createSampleWorkspace();
    workspace.columns.find((column) => column.id === 'fit')!.runCondition = {
      field: 'title',
      operator: 'contains',
      value: 'engineering',
    };

    const result = executeWorkspace(workspace, ['sample-1']);

    expect(result.run.actionCount).toBe(1);
    expect(result.run.skippedCount).toBe(1);
    expect(result.run.receipts.map((receipt) => receipt.columnId)).toEqual([
      'opener',
    ]);
  });

  it('auto-updates safe formulas in column order after an input edit', () => {
    const workspace = createSampleWorkspace();
    const columns = [
      ...workspace.columns.slice(0, -1),
      {
        id: 'first',
        title: 'First name',
        kind: 'formula' as const,
        recipe: 'first-name' as const,
        autoRun: true,
        width: 140,
      },
      {
        id: 'label',
        title: 'Label',
        kind: 'formula' as const,
        recipe: 'custom-formula' as const,
        expression: '{{first}} @ {{company | lower}}',
        autoRun: true,
        width: 220,
        runCondition: {
          field: 'company',
          operator: 'is_not_empty' as const,
        },
      },
      workspace.columns.at(-1)!,
    ];
    const edited = {
      ...workspace.rows[0],
      values: { ...workspace.rows[0].values, person: 'Ada Lovelace' },
    };

    const updated = recalculateAutomaticFormulas(edited, columns, 'person');

    expect(updated.values.first).toBe('Ada');
    expect(updated.values.label).toBe('Ada @ mercury');
  });

  it('preserves a directly edited formula while updating dependents', () => {
    const workspace = createSampleWorkspace();
    const columns = [
      ...workspace.columns.slice(0, -1),
      {
        id: 'first',
        title: 'First name',
        kind: 'formula' as const,
        recipe: 'first-name' as const,
        autoRun: true,
        width: 140,
      },
      {
        id: 'label',
        title: 'Label',
        kind: 'formula' as const,
        recipe: 'custom-formula' as const,
        expression: '{{first}} @ {{company}}',
        autoRun: true,
        width: 220,
      },
      workspace.columns.at(-1)!,
    ];
    const edited = {
      ...workspace.rows[0],
      values: { ...workspace.rows[0].values, first: 'Immy' },
    };

    const updated = recalculateAutomaticFormulas(edited, columns, 'first');

    expect(updated.values.first).toBe('Immy');
    expect(updated.values.label).toBe('Immy @ Mercury');
  });

  it('runs an ordered waterfall and records the winning source', () => {
    const workspace = createSampleWorkspace();
    workspace.columns.splice(
      -1,
      0,
      { id: 'apollo_email', title: 'Apollo email', kind: 'text', width: 220 },
      {
        id: 'best_email',
        title: 'Best email',
        kind: 'formula',
        recipe: 'waterfall',
        autoRun: true,
        width: 220,
        lineageColumnId: 'email_source',
        outputFields: [
          { id: 'best_email', title: 'Best email', valueType: 'text' },
          { id: 'email_source', title: 'Email source', valueType: 'text' },
        ],
        waterfallSteps: [
          { field: 'email', label: 'CRM email' },
          { field: 'apollo_email', label: 'Apollo email' },
        ],
      },
      { id: 'email_source', title: 'Email source', kind: 'text', width: 160 },
    );
    workspace.rows[0].values.email = '';
    workspace.rows[0].values.apollo_email = 'immad@mercury.com';

    const result = executeWorkspace(workspace, ['sample-1']);
    const receipt = result.run.receipts.find(
      (candidate) => candidate.columnId === 'best_email',
    );

    expect(result.workspace.rows[0].values.best_email).toBe(
      'immad@mercury.com',
    );
    expect(result.workspace.rows[0].values.email_source).toBe('Apollo email');
    expect(receipt?.outputValues).toEqual({
      best_email: 'immad@mercury.com',
      email_source: 'Apollo email',
    });
  });

  it('auto-updates a waterfall when a higher-priority value appears', () => {
    const workspace = createSampleWorkspace();
    const columns = [
      {
        id: 'crm_email',
        title: 'CRM email',
        kind: 'text' as const,
        width: 200,
      },
      {
        id: 'apollo_email',
        title: 'Apollo email',
        kind: 'text' as const,
        width: 200,
      },
      {
        id: 'best_email',
        title: 'Best email',
        kind: 'formula' as const,
        recipe: 'waterfall' as const,
        autoRun: true,
        width: 220,
        lineageColumnId: 'email_source',
        waterfallSteps: [
          { field: 'crm_email', label: 'CRM email' },
          { field: 'apollo_email', label: 'Apollo email' },
        ],
      },
      {
        id: 'email_source',
        title: 'Email source',
        kind: 'text' as const,
        width: 160,
      },
    ];
    const row = {
      ...workspace.rows[0],
      values: {
        ...workspace.rows[0].values,
        crm_email: 'crm@example.com',
        apollo_email: 'apollo@example.com',
        best_email: '',
        email_source: '',
      },
    };

    const updated = recalculateAutomaticFormulas(row, columns, 'crm_email');

    expect(updated.values.best_email).toBe('crm@example.com');
    expect(updated.values.email_source).toBe('CRM email');
  });

  it('labels a directly edited waterfall value as a manual override', () => {
    const workspace = createSampleWorkspace();
    const columns = [
      {
        id: 'crm_email',
        title: 'CRM email',
        kind: 'text' as const,
        width: 200,
      },
      {
        id: 'best_email',
        title: 'Best email',
        kind: 'formula' as const,
        recipe: 'waterfall' as const,
        autoRun: true,
        width: 220,
        lineageColumnId: 'email_source',
        waterfallSteps: [{ field: 'crm_email', label: 'CRM email' }],
      },
      {
        id: 'email_source',
        title: 'Email source',
        kind: 'text' as const,
        width: 160,
      },
    ];
    const row = {
      ...workspace.rows[0],
      values: {
        ...workspace.rows[0].values,
        crm_email: 'crm@example.com',
        best_email: 'chosen@example.com',
        email_source: 'CRM email',
      },
    };

    const updated = recalculateAutomaticFormulas(row, columns, 'best_email');

    expect(updated.values.best_email).toBe('chosen@example.com');
    expect(updated.values.email_source).toBe('Manual override');
  });

  it('runs only selected rows when a row scope is supplied', () => {
    const workspace = createSampleWorkspace();
    const untouched = workspace.rows[1].values.opener;
    workspace.rows[0].values.opener = '';

    const result = executeWorkspace(workspace, ['sample-1']);

    expect(result.run.rowCount).toBe(1);
    expect(result.run.actionCount).toBe(2);
    expect(result.workspace.rows[0].values.opener).toContain('Mercury');
    expect(result.workspace.rows[1].values.opener).toBe(untouched);
  });

  it('builds useful identity helpers without an external provider', () => {
    const workspace = createSampleWorkspace();
    workspace.columns.splice(
      -1,
      0,
      {
        id: 'first',
        title: 'First name',
        kind: 'formula',
        recipe: 'first-name',
        width: 140,
      },
      {
        id: 'key',
        title: 'Dedupe key',
        kind: 'formula',
        recipe: 'dedupe-key',
        width: 240,
      },
    );
    workspace.rows[0].values.email = 'Immad@Mercury.com';

    const result = executeWorkspace(workspace, ['sample-1']);

    expect(result.workspace.rows[0].values.first).toBe('Immad');
    expect(result.workspace.rows[0].values.key).toBe('email:immad@mercury.com');
  });

  it('maps the visual columns onto the Scoutbound adapter contract', () => {
    const pipeline = toScoutboundPipeline(createSampleWorkspace());

    expect(pipeline.tab).toBe('Founder targets');
    expect(pipeline.actions).toEqual([
      expect.objectContaining({ id: 'fit', type: 'ai', recipe: 'score-fit' }),
      expect.objectContaining({
        id: 'opener',
        type: 'ai',
        recipe: 'write-opener',
      }),
    ]);
  });

  it('hands Control Tower a bounded preview plan rather than a write command', () => {
    const workspace = createSampleWorkspace();
    const plan = toControlTowerPreview(workspace, [workspace.rows[0].id]);

    expect(plan.mode).toBe('preview');
    expect(plan.guards).toEqual({ maxRecords: 100, allowCreate: false });
    expect(plan.records).toHaveLength(1);
    expect(plan.records[0].externalKey).toBe('mercury.com');
    expect(plan.records[0].proposedFields).not.toHaveProperty('status');
  });

  it('uses a CRM record identity for a Control Tower handoff when available', () => {
    const workspace = createSampleWorkspace();
    workspace.rows[0].values.crm_source = 'HubSpot contact';
    workspace.rows[0].values.crm_id = '123';
    workspace.rows[0].values.email = 'immad@mercury.com';

    const plan = toControlTowerPreview(workspace, ['sample-1']);

    expect(plan.records[0].externalKey).toBe('HubSpot contact:123');
  });
});
