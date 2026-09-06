import { describe, expect, it, vi } from 'vitest';
import {
  listHubSpotSegments,
  readHubSpotSegmentPage,
} from './hubspot-segments';
import { readCrmSource } from './crm-sources';
import { applyCrmImport, mergeCrmSourcePages } from './crm-import';
import { createSampleWorkspace } from './sample-workspace';

const contactList = {
  listId: '11',
  name: 'Pomade test contacts',
  objectTypeId: '0-1',
  processingType: 'MANUAL',
};
const options = (fetchImpl: typeof fetch) => ({
  hubSpotAccessToken: 'test-token',
  fetchImpl,
});
const contact = (id: string) => ({
  id,
  properties: {
    firstname: 'Test',
    lastname: id,
    email: `test${id}@example.com`,
  },
});

describe('HubSpot segment imports', () => {
  it('loads every catalog page before offering segments, with stable names and counts', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ lists: [contactList], hasMore: true, offset: 100 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          lists: [
            {
              ...contactList,
              listId: '12',
              name: 'Another segment',
              additionalProperties: { hs_list_size: '150' },
            },
          ],
          hasMore: false,
        }),
      );
    const lists = await listHubSpotSegments('contact', options(fetcher));
    expect(lists.map((list) => list.id)).toEqual(['12', '11']);
    expect(lists[0].size).toBe(150);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({
      offset: 100,
      objectTypeId: '0-1',
    });
    expect(
      fetcher.mock.calls.every(([url]) =>
        String(url).endsWith('/lists/search'),
      ),
    ).toBe(true);
  });

  it('explains missing segment scope instead of silently offering all CRM records', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 403 }));
    await expect(
      listHubSpotSegments('contact', options(fetcher)),
    ).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining('crm.lists.read'),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refuses an incomplete catalog when pagination stops advancing', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ lists: [contactList], hasMore: true, offset: 0 }),
      );
    await expect(
      listHubSpotSegments('contact', options(fetcher)),
    ).rejects.toThrow('did not advance');
  });

  it('reads only the selected segment membership and preserves pagination and extra fields', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ list: contactList }))
      .mockResolvedValueOnce(
        Response.json({
          results: [{ recordId: '101' }, { recordId: '102' }],
          paging: { next: { after: '102' } },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          results: [contact('999'), contact('102'), contact('101')],
        }),
      );
    const preview = await readCrmSource('hubspot', 2, {
      ...options(fetcher),
      segmentId: '11',
      fields: ['lifecyclestage'],
    });
    expect(preview.contacts.map((row) => row.nativeId)).toEqual(['101', '102']);
    expect(preview).toMatchObject({
      nextAfter: '102',
      truncated: true,
      segment: { id: '11', name: contactList.name },
      fields: ['lifecyclestage'],
    });
    expect(String(fetcher.mock.calls[1][0])).toContain(
      '/lists/11/memberships?limit=2',
    );
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({
      inputs: [{ id: '101' }, { id: '102' }],
      properties: expect.arrayContaining(['lifecyclestage']),
    });
  });

  it('imports an empty segment as zero records without an unfiltered CRM fetch', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ list: contactList }))
      .mockResolvedValueOnce(Response.json({ results: [] }));
    const preview = await readCrmSource('hubspot', 100, {
      ...options(fetcher),
      segmentId: '11',
    });
    expect(preview.contacts).toEqual([]);
    expect(preview.truncated).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects mismatched record types and mixed filters before reading members', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ list: contactList }));
    await expect(
      readCrmSource('hubspot', 10, {
        ...options(fetcher),
        objectType: 'company',
        segmentId: '11',
      }),
    ).rejects.toThrow('different record type');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      readCrmSource('salesforce', 10, { ...options(fetcher), segmentId: '11' }),
    ).rejects.toThrow('Choose a HubSpot segment');
    await expect(
      readCrmSource('hubspot', 10, {
        ...options(fetcher),
        segmentId: '11',
        recordIds: [],
      }),
    ).rejects.toThrow('record-ID filter');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('uses the next member cursor without treating exactly one full page as truncated', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ list: contactList }))
      .mockResolvedValueOnce(Response.json({ results: [{ recordId: '103' }] }));
    const page = await readHubSpotSegmentPage(
      '11',
      'contact',
      1,
      '102',
      options(fetcher),
    );
    expect(page.recordIds).toEqual(['103']);
    expect(page.nextAfter).toBeUndefined();
    expect(String(fetcher.mock.calls[1][0])).toContain('after=102');
  });

  it('merges preview pages and repeated imports by native ID while retaining the segment and recipe results', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ list: contactList }))
      .mockResolvedValueOnce(Response.json({ results: [{ recordId: '101' }] }))
      .mockResolvedValueOnce(Response.json({ results: [contact('101')] }));
    const first = await readCrmSource('hubspot', 100, {
      ...options(fetcher),
      segmentId: '11',
    });
    const combined = mergeCrmSourcePages(first, {
      ...first,
      contacts: [...first.contacts, { ...first.contacts[0], nativeId: '102' }],
    });
    expect(combined.contacts).toHaveLength(2);
    const imported = applyCrmImport(
      createSampleWorkspace(),
      combined,
      'replace',
    );
    imported.rows[0].values.fit = 'Strong · 90';
    const repeated = applyCrmImport(imported, combined, 'append');
    expect(repeated.rows).toHaveLength(2);
    expect(repeated.rows[0].values.fit).toBe('Strong · 90');
    expect(repeated.source?.segment?.id).toBe('11');
    expect(() =>
      mergeCrmSourcePages(first, {
        ...first,
        segment: { ...first.segment!, id: '12' },
      }),
    ).toThrow('source changed');
  });
});
