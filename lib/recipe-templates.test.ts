import { describe, expect, it } from 'vitest';

import { executeWorkspace } from './local-recipe-engine';
import type { PomadeColumn, WorkspaceSnapshot } from './pomade-types';
import {
  createRecipeTemplate,
  defaultTemplateBindings,
  instantiateRecipeTemplate,
} from './recipe-templates';

function textColumn(id: string, title: string): PomadeColumn {
  return { id, title, kind: 'text', width: 160 };
}

describe('recipe templates', () => {
  it('declares formula inputs and preserves the configured output', () => {
    const columns = [
      textColumn('person', 'Person'),
      textColumn('company', 'Company'),
    ];
    const column: PomadeColumn = {
      id: 'label',
      title: 'Personal label',
      kind: 'formula',
      recipe: 'custom-formula',
      expression: '{{person | first}} at {{company}}',
      autoRun: true,
      width: 260,
    };

    const template = createRecipeTemplate(column, [...columns, column], {
      id: 'template-1',
      name: 'Personal label',
      description: 'A reusable greeting label.',
      createdAt: 1,
    });

    expect(template.inputs).toMatchObject([
      { key: 'person', title: 'Person', required: true },
      { key: 'company', title: 'Company', required: true },
    ]);
    expect(template.column).toMatchObject({
      title: 'Personal label',
      expression: '{{person | first}} at {{company}}',
      autoRun: true,
    });
  });

  it('maps declared inputs by title and runs against a different schema', () => {
    const sourceColumns = [
      textColumn('person', 'Person'),
      textColumn('company', 'Company'),
    ];
    const source: PomadeColumn = {
      id: 'label',
      title: 'Personal label',
      kind: 'formula',
      recipe: 'custom-formula',
      expression: '{{person | first}} at {{company}}',
      autoRun: true,
      width: 260,
    };
    const template = createRecipeTemplate(source, [...sourceColumns, source], {
      id: 'template-1',
      name: 'Personal label',
      createdAt: 1,
    });
    const targetColumns = [
      textColumn('contact_name', 'Person'),
      textColumn('account_name', 'Company'),
      {
        id: 'status',
        title: 'Run status',
        kind: 'status',
        width: 120,
      } as const,
    ];
    const bindings = defaultTemplateBindings(template, targetColumns);
    const [instantiated] = instantiateRecipeTemplate(
      template,
      targetColumns,
      bindings,
    );
    const workspace: WorkspaceSnapshot = {
      id: 'test',
      name: 'Test',
      columns: [
        targetColumns[0],
        targetColumns[1],
        instantiated,
        targetColumns[2],
      ],
      rows: [
        {
          id: 'row-1',
          values: {
            contact_name: 'Ada Lovelace',
            account_name: 'Analytical Engines',
            [instantiated.id]: '',
            status: '',
          },
        },
      ],
      updatedAt: 1,
    };

    expect(bindings).toEqual({
      person: 'contact_name',
      company: 'account_name',
    });
    expect(instantiated.inputBindings).toEqual({
      person: 'contact_name',
      company: 'account_name',
    });
    expect(
      executeWorkspace(workspace).workspace.rows[0].values[instantiated.id],
    ).toBe('Ada at Analytical Engines');
  });

  it('creates fresh adjacent outputs for a structured research template', () => {
    const existing = [
      textColumn('company', 'Company'),
      textColumn('trigger', 'Recent trigger'),
    ];
    const research: PomadeColumn = {
      id: 'research',
      title: 'Recent trigger',
      kind: 'enrichment',
      recipe: 'web-research',
      prompt: 'Research {{company}}.',
      width: 320,
      outputFields: [
        { id: 'research', title: 'Recent trigger', valueType: 'text' },
        { id: 'research_date', title: 'Trigger date', valueType: 'date' },
      ],
    };
    const template = createRecipeTemplate(research, [...existing, research], {
      id: 'template-2',
      name: 'Account trigger',
      createdAt: 2,
    });
    const added = instantiateRecipeTemplate(template, existing, {
      company: 'company',
      domain: '',
      person: '',
      title: '',
    });

    expect(added.map((column) => column.title)).toEqual([
      'Recent trigger 2',
      'Trigger date',
    ]);
    expect(added[0].outputFields).toEqual([
      { id: 'recent_trigger_2', title: 'Recent trigger 2', valueType: 'text' },
      { id: 'trigger_date', title: 'Trigger date', valueType: 'date' },
    ]);
    expect(added[1]).toMatchObject({
      id: 'trigger_date',
      kind: 'text',
      valueType: 'date',
    });
  });

  it('requires every declared required input before instantiation', () => {
    const column: PomadeColumn = {
      id: 'first',
      title: 'First name',
      kind: 'formula',
      recipe: 'first-name',
      width: 160,
    };
    const template = createRecipeTemplate(column, [column], {
      id: 'template-3',
      name: 'First name',
    });

    expect(() => instantiateRecipeTemplate(template, [], {})).toThrow(
      'Person needs an input column.',
    );
  });

  it('requires and remaps an input used by a saved run condition', () => {
    const columns = [
      textColumn('company', 'Company'),
      textColumn('segment', 'Segment'),
    ];
    const column: PomadeColumn = {
      id: 'summary',
      title: 'Company summary',
      kind: 'enrichment',
      recipe: 'company-summary',
      width: 260,
      runCondition: {
        field: 'segment',
        operator: 'equals',
        value: 'Enterprise',
      },
    };
    const template = createRecipeTemplate(column, [...columns, column], {
      id: 'template-4',
      name: 'Enterprise summary',
    });
    const targetColumns = [
      textColumn('account_name', 'Company'),
      textColumn('tier', 'Segment'),
    ];
    const bindings = defaultTemplateBindings(template, targetColumns);
    const [instantiated] = instantiateRecipeTemplate(
      template,
      targetColumns,
      bindings,
    );

    expect(
      template.inputs.find((input) => input.title === 'Segment'),
    ).toMatchObject({ required: true });
    expect(instantiated.runCondition).toEqual({
      field: 'tier',
      operator: 'equals',
      value: 'Enterprise',
    });
  });

  it('recreates waterfall outputs and lineage against mapped sources', () => {
    const columns = [
      textColumn('crm_email', 'CRM email'),
      textColumn('apollo_email', 'Apollo email'),
    ];
    const column: PomadeColumn = {
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
        { field: 'crm_email', label: 'CRM email' },
        { field: 'apollo_email', label: 'Apollo email' },
      ],
    };
    const template = createRecipeTemplate(column, [...columns, column], {
      id: 'template-5',
      name: 'Best email waterfall',
    });
    const targetColumns = [
      textColumn('hubspot_work_email', 'HubSpot work email'),
      textColumn('apollo_work_email', 'Apollo verified email'),
    ];
    const added = instantiateRecipeTemplate(template, targetColumns, {
      crm_email: 'hubspot_work_email',
      apollo_email: 'apollo_work_email',
    });

    expect(added[0]).toMatchObject({
      recipe: 'waterfall',
      inputBindings: {
        crm_email: 'hubspot_work_email',
        apollo_email: 'apollo_work_email',
      },
      lineageColumnId: 'email_source',
      waterfallSteps: [
        { field: 'crm_email', label: 'HubSpot work email' },
        { field: 'apollo_email', label: 'Apollo verified email' },
      ],
    });
    expect(added.map((item) => item.id)).toEqual([
      'best_email',
      'email_source',
    ]);
  });
});
