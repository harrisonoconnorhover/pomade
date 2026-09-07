import { describe, it, expect, vi } from 'vitest';
import { createTable } from './workbook';
import { readSavedCrmSource, applyCrmRefresh } from './crm-refresh';
import { readCrmSource } from './crm-sources';
const workspace = () => ({
  ...createTable({ id: 'crm', name: 'CRM', mode: 'empty' }),
  source: {
    provider: 'hubspot' as const,
    objectType: 'company' as const,
    label: 'HubSpot companies',
    fields: [],
    importedAt: 1,
  },
});
describe('complete CRM refresh', () => {
  it('follows HubSpot pages and only marks absence after the last page', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          results: [{ id: '1', properties: { name: 'One' } }],
          paging: { next: { after: '2' } },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ results: [{ id: '2', properties: { name: 'Two' } }] }),
      );
    const p = await readSavedCrmSource(workspace(), 100, {
      hubSpotAccessToken: 'test',
      fetchImpl,
    });
    expect(p.contacts.map((c) => c.nativeId)).toEqual(['1', '2']);
    expect(p.truncated).toBe(false);
    expect(
      new URL((fetchImpl.mock.calls[1][0] as URL).href).searchParams.get('after'),
    ).toBe('2');
  });
  it('keeps unreturned records and labels partial membership as unchecked', async () => {
    const w = workspace();
    w.rows = [
      {
        id: 'existing',
        values: {
          crm_id: '7',
          crm_source: 'HubSpot company',
          company: 'Retain',
        },
      },
    ];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({
          results: [{ id: '1', properties: { name: 'One' } }],
          paging: { next: { after: '2' } },
        }),
      );
    const preview = await readSavedCrmSource(w, 1, {
      hubSpotAccessToken: 'test',
      fetchImpl,
    });
    const partial = applyCrmRefresh(w, preview);
    expect(partial.summary.notReturned).toBeNull();
    expect(partial.workspace.rows[0].values.crm_membership).toContain(
      'Not checked',
    );
    const complete = applyCrmRefresh(w, {
      ...preview,
      truncated: false,
      nextAfter: undefined,
    });
    expect(complete.summary.notReturned).toBe(1);
    expect(complete.workspace.rows[0].values.company).toBe('Retain');
    expect(complete.workspace.rows[0].values.crm_membership).toBe(
      'No longer in source',
    );
  });
  it('uses validated Salesforce ID pagination and never interpolates arbitrary cursors', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({
          records: [{ Id: '001000000000002AAA', Name: 'Next' }],
        }),
      );
    const preview = await readCrmSource('salesforce', 1, {
      objectType: 'account',
      after: '001000000000001AAA',
      salesforceAccessToken: 'test',
      salesforceInstanceUrl: 'https://example.my.salesforce.com',
      fetchImpl,
    });
    expect(
      new URL((fetchImpl.mock.calls[0][0] as URL).href).searchParams.get('q'),
    ).toContain("WHERE Id > '001000000000001AAA' ORDER BY Id ASC");
    expect(preview.nextAfter).toBe('001000000000002AAA');
    await expect(
      readCrmSource('salesforce', 1, { after: "x' OR Name!='", fetchImpl }),
    ).rejects.toThrow('cursor');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('fails a repeated page instead of presenting a partial source as complete', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ results: [], paging: { next: { after: '2' } } }),
      );
    await expect(
      readSavedCrmSource(workspace(), 100, {
        hubSpotAccessToken: 'test',
        fetchImpl,
      }),
    ).rejects.toThrow('repeated a page');
  });
});
