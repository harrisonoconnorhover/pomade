import { describe, expect, it } from 'vitest';

import { applyCrmImport, reviewCrmImport, savedCrmSource } from './crm-import';
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

describe('saved CRM refresh', () => {
  it('remembers segment, record type and explicit extra properties, including an empty source', () => {
    const preview: CrmSourcePreview = {
      ...PREVIEW,
      objectType: 'company',
      contacts: [],
      fields: ['industry'],
      segment: {
        id: '9',
        name: 'Target accounts',
        objectType: 'company',
        processingType: 'DYNAMIC',
      },
    };
    const imported = applyCrmImport(createSampleWorkspace(), preview, 'append');
    expect(savedCrmSource(imported)).toEqual({
      provider: 'hubspot',
      objectType: 'company',
      segmentId: '9',
      fields: ['industry'],
    });
  });

  it('restores older segment imports without guessing an ambiguous CRM object', () => {
    const imported = applyCrmImport(
      createSampleWorkspace(),
      PREVIEW,
      'replace',
    );
    delete imported.source!.objectType;
    delete imported.source!.fields;
    imported.columns.push({
      id: 'crm_property_industry',
      title: 'Industry',
      kind: 'text',
      width: 100,
    });
    expect(savedCrmSource(imported)).toMatchObject({
      objectType: 'contact',
      fields: ['industry'],
    });
    imported.rows.push({
      id: 'company-101',
      values: { crm_source: 'HubSpot company', crm_id: '101' },
    });
    expect(savedCrmSource(imported)).toBeUndefined();
    expect(savedCrmSource(createSampleWorkspace())).toBeUndefined();
  });

  it('preserves primary and secondary recipe outputs, run status and column order', () => {
    const imported = applyCrmImport(
      createSampleWorkspace(),
      PREVIEW,
      'replace',
    );
    imported.columns.find((c) => c.id === 'email')!.kind = 'enrichment';
    imported.columns.find((c) => c.id === 'fit')!.outputFields = [
      { id: 'phone', title: 'Phone', valueType: 'text' },
    ];
    imported.rows[0].values.email = 'enriched@example.com';
    imported.rows[0].values.phone = '+1 555 9999';
    imported.rows[0].values.fit = 'Strong';
    imported.rows[0].values.status = 'Done';
    imported.columns.unshift(imported.columns.pop()!);
    const changed = {
      ...PREVIEW,
      contacts: [{ ...PREVIEW.contacts[0], jobTitle: 'CTO' }],
    };
    const result = applyCrmImport(imported, changed, 'append');
    expect(result.rows[0].values).toMatchObject({
      title: 'CTO',
      email: 'enriched@example.com',
      phone: '+1 555 9999',
      fit: 'Strong',
      status: 'Done',
    });
    expect(result.columns.map((c) => c.id)).toEqual(
      imported.columns.map((c) => c.id),
    );
    expect(reviewCrmImport(imported, changed).changes[0].fields).toEqual([
      { title: 'Title', before: 'Founder', after: 'CTO' },
    ]);
  });

  it('shows additions, changed/cleared values and unchanged rows while keeping missing records', () => {
    const initial = {
      ...PREVIEW,
      contacts: [
        PREVIEW.contacts[0],
        { ...PREVIEW.contacts[0], nativeId: '102' },
        { ...PREVIEW.contacts[0], nativeId: '103' },
      ],
    };
    const imported = applyCrmImport(
      createSampleWorkspace(),
      initial,
      'replace',
    );
    imported.rows[0].values.fit = 'Strong';
    const preview = {
      ...PREVIEW,
      contacts: [
        { ...PREVIEW.contacts[0], jobTitle: '' },
        initial.contacts[1],
        { ...PREVIEW.contacts[0], nativeId: '104' },
      ],
    };
    const review = reviewCrmImport(imported, preview);
    expect(review).toMatchObject({
      added: 1,
      updated: 1,
      unchanged: 1,
      notReturned: 1,
    });
    expect(review.changes[0].fields).toEqual([
      { title: 'Title', before: 'Founder', after: '' },
    ]);
    const merged = applyCrmImport(imported, preview, 'append');
    expect(merged.rows.map((r) => r.values.crm_id)).toEqual([
      '101',
      '102',
      '103',
      '104',
    ]);
    expect(merged.rows[0].values.fit).toBe('Strong');
    expect(reviewCrmImport(merged, preview)).toMatchObject({
      added: 0,
      updated: 0,
      unchanged: 3,
      notReturned: 1,
    });
  });

  it('does not infer absent members from a partial preview and handles empty complete segments', () => {
    const imported = applyCrmImport(
      createSampleWorkspace(),
      PREVIEW,
      'replace',
    );
    expect(
      reviewCrmImport(imported, {
        ...PREVIEW,
        contacts: [],
        truncated: true,
        objectType: 'contact',
      }).notReturned,
    ).toBeNull();
    expect(
      reviewCrmImport(imported, {
        ...PREVIEW,
        contacts: [],
        objectType: 'contact',
      }).notReturned,
    ).toBe(1);
    expect(
      applyCrmImport(imported, { ...PREVIEW, contacts: [] }, 'append').rows,
    ).toEqual(imported.rows);
  });

  it('keeps Salesforce and HubSpot identities separate and refreshes requested properties', () => {
    const imported = applyCrmImport(
      createSampleWorkspace(),
      PREVIEW,
      'replace',
    );
    const preview: CrmSourcePreview = {
      ...PREVIEW,
      provider: 'salesforce',
      objectType: 'contact',
      fields: ['Department'],
      contacts: [
        { ...PREVIEW.contacts[0], properties: { Department: 'Engineering' } },
      ],
    };
    expect(reviewCrmImport(imported, preview)).toMatchObject({
      added: 1,
      updated: 0,
      notReturned: 0,
    });
    const merged = applyCrmImport(imported, preview, 'append');
    expect(merged.rows).toHaveLength(2);
    expect(savedCrmSource(merged)).toEqual({
      provider: 'salesforce',
      objectType: 'contact',
      segmentId: undefined,
      fields: ['Department'],
    });
    const updated = {
      ...preview,
      contacts: [
        { ...preview.contacts[0], properties: { Department: 'Revenue' } },
      ],
    };
    expect(reviewCrmImport(merged, updated).changes[0].fields).toEqual([
      { title: 'CRM: Department', before: 'Engineering', after: 'Revenue' },
    ]);
    expect(
      applyCrmImport(merged, updated, 'append').rows[1].values
        .crm_property_Department,
    ).toBe('Revenue');
  });
});
