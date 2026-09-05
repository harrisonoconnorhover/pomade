import { describe, expect, it } from 'vitest';

import {
  suggestControlTowerMappings,
  toControlTowerPreview,
} from './control-tower-adapter';
import { createSampleWorkspace } from './sample-workspace';

describe('Control Tower handoff mapping', () => {
  it('suggests portable contact fields from ordinary Pomade columns', () => {
    const workspace = createSampleWorkspace();
    const mappings = suggestControlTowerMappings(workspace.columns, 'hubspot');

    expect(mappings).toEqual([
      expect.objectContaining({
        sourceColumnId: 'person',
        contactField: 'fullName',
        destinationFields: ['firstname', 'lastname'],
      }),
      expect.objectContaining({
        sourceColumnId: 'company',
        contactField: 'company',
      }),
      expect.objectContaining({
        sourceColumnId: 'title',
        contactField: 'jobTitle',
      }),
      expect.objectContaining({
        sourceColumnId: 'domain',
        contactField: 'website',
      }),
    ]);
  });

  it('packages only mapped fields with Salesforce destination metadata', () => {
    const workspace = createSampleWorkspace();
    workspace.columns.push({
      id: 'email',
      title: 'Work email',
      kind: 'text',
      width: 200,
    });
    workspace.rows[0].values.email = 'immad@mercury.com';
    const suggestions = suggestControlTowerMappings(
      workspace.columns,
      'salesforce',
    );
    const mappings = suggestions.filter((mapping) =>
      ['email', 'company'].includes(mapping.contactField),
    );
    const plan = toControlTowerPreview(workspace, ['sample-1'], {
      provider: 'salesforce',
      mappings,
    });

    expect(plan.destination).toEqual({
      provider: 'salesforce',
      objectType: 'lead',
    });
    expect(plan.fieldMappings).toEqual([
      expect.objectContaining({
        contactField: 'email',
        destinationFields: ['Email'],
      }),
      expect.objectContaining({
        contactField: 'company',
        destinationFields: ['Company'],
      }),
    ]);
    expect(plan.records[0].proposedFields).toEqual({
      email: 'immad@mercury.com',
      company: 'Mercury',
    });
  });

  it('drops duplicate destinations and hidden columns from custom mappings', () => {
    const workspace = createSampleWorkspace();
    const plan = toControlTowerPreview(workspace, ['sample-1'], {
      mappings: [
        {
          sourceColumnId: 'company',
          sourceColumnTitle: 'Company',
          contactField: 'company',
          destinationFields: [],
        },
        {
          sourceColumnId: 'domain',
          sourceColumnTitle: 'Company domain',
          contactField: 'company',
          destinationFields: [],
        },
        {
          sourceColumnId: 'status',
          sourceColumnTitle: 'Run status',
          contactField: 'email',
          destinationFields: [],
        },
      ],
    });

    expect(plan.fieldMappings).toHaveLength(1);
    expect(plan.records[0].proposedFields).toEqual({ company: 'Mercury' });
  });
});
