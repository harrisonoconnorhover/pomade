import { describe, expect, it } from 'vitest';

import { applyCrmImport } from './crm-import';
import type { CrmSourcePreview } from './pomade-types';
import { createSampleWorkspace } from './sample-workspace';

const PREVIEW: CrmSourcePreview = {
  provider: 'hubspot',
  sourceLabel: 'HubSpot contacts',
  contacts: [
    {
      nativeId: '101',
      objectType: 'contact',
      fullName: 'Ada Lovelace',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      company: 'Example',
      phone: '+1 555 0101',
      jobTitle: 'Founder',
      website: 'https://www.example.com/about',
    },
  ],
  truncated: false,
  readAt: '2026-09-04T12:00:00.000Z',
};

describe('CRM imports', () => {
  it('replaces records while preserving configured recipe columns', () => {
    const result = applyCrmImport(createSampleWorkspace(), PREVIEW, 'replace');

    expect(result.name).toBe('HubSpot contacts');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].values).toMatchObject({
      company: 'Example',
      person: 'Ada Lovelace',
      email: 'ada@example.com',
      domain: 'example.com',
      crm_source: 'HubSpot contact',
      crm_id: '101',
      status: 'Ready',
    });
    expect(result.columns.map((column) => column.id)).toEqual(
      expect.arrayContaining(['fit', 'opener', 'crm_source', 'crm_id']),
    );
  });

  it('updates an appended CRM record without erasing generated values', () => {
    const imported = applyCrmImport(createSampleWorkspace(), PREVIEW, 'append');
    const crmRow = imported.rows.find((row) => row.values.crm_id === '101')!;
    crmRow.values.fit = 'Strong · 90';
    const changed = {
      ...PREVIEW,
      contacts: [{ ...PREVIEW.contacts[0], jobTitle: 'Chief Scientist' }],
    };

    const result = applyCrmImport(imported, changed, 'append');
    const updated = result.rows.find((row) => row.values.crm_id === '101')!;
    expect(result.rows).toHaveLength(imported.rows.length);
    expect(updated.values.title).toBe('Chief Scientist');
    expect(updated.values.fit).toBe('Strong · 90');
  });
});
