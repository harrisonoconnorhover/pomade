import { describe, expect, it, vi } from 'vitest';
import { normalizeCrmValue, parseCrmFields, type CrmField } from './crm-fields';
import {
  CrmSyncClient,
  previewCrmSync,
  executeCrmAction,
  type CrmSyncConfig,
} from './crm-sync';
import { createTable } from './workbook';
import { readCrmSource } from './crm-sources';
import { applyCrmImport } from './crm-import';
const score: CrmField = {
  name: 'Pomade_ICP_Score__c',
  label: 'Score',
  type: 'number',
  createable: true,
  updateable: true,
};
const rawScore = {
  name: score.name,
  label: score.label,
  type: 'double',
  createable: true,
  updateable: true,
};
describe('native CRM field mappings', () => {
  it('excludes calculated/read-only fields and validates typed values and options', () => {
    expect(
      parseCrmFields('salesforce', {
        fields: [
          rawScore,
          { ...rawScore, name: 'ReadOnly__c', calculated: true },
        ],
      }),
    ).toEqual([score]);
    expect(
      parseCrmFields('hubspot', {
        results: [
          {
            name: 'score',
            type: 'number',
            modificationMetadata: { readOnlyValue: true },
          },
        ],
      }),
    ).toEqual([]);
    expect(normalizeCrmValue('100.0', score)).toBe('100');
    expect(() => normalizeCrmValue('51–100', score)).toThrow('plain number');
    expect(normalizeCrmValue('Yes', { ...score, type: 'boolean' })).toBe(
      'true',
    );
    expect(() =>
      normalizeCrmValue('2026-02-30', { ...score, type: 'date' }),
    ).toThrow('YYYY-MM-DD');
    const select = {
      ...score,
      type: 'multiselect' as const,
      options: [
        { value: 'hiring', label: 'Hiring' },
        { value: 'high', label: 'High' },
      ],
    };
    expect(normalizeCrmValue('hiring;high;hiring', select)).toBe('high;hiring');
    expect(() => normalizeCrmValue('unknown', select)).toThrow('option value');
  });
  it('loads authoritative metadata, sends a numeric Salesforce score and verifies its read-back', async () => {
    const w = createTable({ id: 't', name: 'Scores', mode: 'empty' });
    w.columns.push(
      { id: 'score', title: 'Score', kind: 'text', width: 160 },
      { id: 'id', title: 'ID', kind: 'text', width: 160 },
    );
    w.rows = [
      {
        id: 'r',
        values: {
          company: 'Example',
          score: '100.0',
          id: '001000000000001AAA',
        },
      },
    ];
    const config: CrmSyncConfig = {
      provider: 'salesforce',
      objectType: 'account',
      idColumn: 'id',
      mapping: { [score.name]: 'score' },
      fieldSchema: { [score.name]: { ...score, type: 'text' } },
    };
    let value = 50;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (url.endsWith('/describe'))
          return Response.json({ fields: [rawScore] });
        if (init?.method === 'PATCH') {
          const body = JSON.parse(init.body as string);
          expect(body[score.name]).toBe(100);
          value = body[score.name];
          return new Response(null, { status: 204 });
        }
        return Response.json({ [score.name]: value });
      });
    const options = {
      salesforceAccessToken: 'fixture',
      salesforceInstanceUrl: 'https://example.my.salesforce.com',
      fetchImpl,
    };
    const plan = await previewCrmSync(w, ['r'], config, options);
    expect(plan.config.fieldSchema?.[score.name].type).toBe('number');
    expect(plan.actions[0]).toMatchObject({
      action: 'update',
      properties: { [score.name]: '100' },
    });
    const result = await executeCrmAction(
      plan.actions[0],
      new CrmSyncClient(plan.config, options),
    );
    expect(result.status).toBe('verified');
    expect(
      fetchImpl.mock.calls.filter(([, init]) => init?.method === 'PATCH'),
    ).toHaveLength(1);
    const again = await previewCrmSync(w, ['r'], config, options);
    expect(again.actions[0].action).toBe('unchanged');
  });
  it('rejects forged field metadata and invalid numbers before any write', async () => {
    const w = createTable({ id: 't', name: 'Scores', mode: 'empty' });
    const config: CrmSyncConfig = {
      provider: 'salesforce',
      objectType: 'account',
      mapping: { [score.name]: 'company' },
      fieldSchema: { [score.name]: score },
    };
    w.rows = [{ id: 'r', values: { company: 'not a score' } }];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ fields: [] }));
    const options = {
      salesforceAccessToken: 'fixture',
      salesforceInstanceUrl: 'https://example.my.salesforce.com',
      fetchImpl,
    };
    await expect(previewCrmSync(w, ['r'], config, options)).rejects.toThrow(
      'missing or read-only',
    );
    fetchImpl.mockImplementation(async () =>
      Response.json({ fields: [rawScore] }),
    );
    const plan = await previewCrmSync(w, ['r'], config, options);
    expect(plan.actions[0]).toMatchObject({
      action: 'review',
      message: 'Score: use a plain number',
    });
    expect(
      fetchImpl.mock.calls.every(([, init]) => init?.method === 'GET'),
    ).toBe(true);
  });
  it('pulls custom CRM values into dedicated columns and refreshes them without dropping manual notes', async () => {
    let value = 95;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        expect(
          new URL(
            input instanceof Request ? input.url : input,
          ).searchParams.get('q'),
        ).toContain('Pomade_ICP_Score__c');
        return Response.json({
          records: [
            {
              Id: '001000000000001AAA',
              Name: 'Example',
              Website: 'example.com',
              [score.name]: value,
            },
          ],
        });
      });
    const options = {
      objectType: 'account' as const,
      fields: [score.name],
      salesforceAccessToken: 'fixture',
      salesforceInstanceUrl: 'https://example.my.salesforce.com',
      fetchImpl,
    };
    let w = createTable({ id: 't', name: 'Import', mode: 'empty' });
    w = applyCrmImport(
      w,
      await readCrmSource('salesforce', 10, options),
      'replace',
    );
    expect(w.rows[0].values.crm_property_Pomade_ICP_Score__c).toBe('95');
    w.columns.push({ id: 'notes', title: 'Notes', kind: 'text', width: 160 });
    w.rows[0].values.notes = 'Keep';
    value = 100;
    w = applyCrmImport(
      w,
      await readCrmSource('salesforce', 10, options),
      'append',
    );
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0].values).toMatchObject({
      crm_property_Pomade_ICP_Score__c: '100',
      notes: 'Keep',
    });
  });
});
