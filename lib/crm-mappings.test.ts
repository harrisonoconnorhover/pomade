import { describe, expect, it } from 'vitest';
import { createTable } from './workbook';
import {
  deleteWorkspaceColumn,
  findColumnDependencies,
} from './column-management';
import { applyCrmImport } from './crm-import';
import {
  copyVerifiedCrmIds,
  removeCrmMapping,
  saveCrmMapping,
  sameCrmConfig,
} from './crm-mappings';
import type { CrmSyncConfig, CrmSyncPlan } from './crm-sync';

const config: CrmSyncConfig = {
  provider: 'hubspot',
  objectType: 'company',
  mapping: { name: 'company', domain: 'domain' },
};
function workspace() {
  const w = createTable({ id: 'accounts', name: 'Accounts', mode: 'empty' });
  w.rows = [
    {
      id: 'a',
      values: { company: 'Acme', domain: 'acme.example', status: 'Ready' },
    },
    {
      id: 'b',
      values: { company: 'Beta', domain: 'beta.example', status: 'Ready' },
    },
  ];
  return w;
}
function receipt(): CrmSyncPlan {
  return {
    id: 'batch',
    workspaceId: 'accounts',
    revision: 1,
    createdAt: 1,
    status: 'complete',
    config,
    actions: [
      {
        rowId: 'a',
        label: 'Acme',
        properties: { name: 'Acme', domain: 'acme.example' },
        before: {},
        nativeId: '101',
        action: 'create',
        status: 'verified',
      },
      {
        rowId: 'b',
        label: 'Beta',
        properties: { name: 'Beta', domain: 'beta.example' },
        before: {},
        nativeId: '102',
        action: 'create',
        status: 'verified',
      },
    ],
  };
}

describe('saved CRM mappings', () => {
  it('persists an independent mapping and updates it in place without capturing row scope', () => {
    const draft = structuredClone(config);
    const saved = saveCrmMapping(workspace(), {
      id: 'hs',
      name: '  HubSpot  companies ',
      config: draft,
    });
    draft.mapping.name = 'person';
    const reloaded = JSON.parse(JSON.stringify(saved));
    expect(reloaded.crmMappings).toEqual([
      { id: 'hs', name: 'HubSpot companies', config },
    ]);
    const updated = saveCrmMapping(reloaded, {
      id: 'hs',
      name: 'Account research',
      config: { ...config, mapping: { domain: 'domain' } },
    });
    expect(updated.crmMappings).toHaveLength(1);
    expect(updated.crmMappings![0].config.mapping).toEqual({
      domain: 'domain',
    });
    expect(updated.rows).toEqual(saved.rows);
    expect(
      createTable({
        id: 'copy',
        name: 'Copy',
        mode: 'duplicate',
        source: updated,
      }).crmMappings,
    ).toEqual(updated.crmMappings);
  });
  it('rejects duplicate names, unsupported fields and missing source columns', () => {
    const w = saveCrmMapping(workspace(), {
      id: 'one',
      name: 'Accounts',
      config,
    });
    expect(() =>
      saveCrmMapping(w, { id: 'two', name: 'ACCOUNTS', config }),
    ).toThrow('already');
    expect(() =>
      saveCrmMapping(w, {
        id: 'two',
        name: 'Other',
        config: { ...config, mapping: { unsupported: 'company' } },
      }),
    ).toThrow('mapped columns');
    expect(() =>
      saveCrmMapping(w, {
        id: 'two',
        name: 'Other',
        config: { ...config, idColumn: 'missing' },
      }),
    ).toThrow('mapped columns');
    expect(
      sameCrmConfig(config, {
        ...config,
        mapping: { domain: 'domain', name: 'company' },
      }),
    ).toBe(true);
  });
  it('protects both mapped inputs and record IDs from deletion until the mapping is removed', () => {
    const w = workspace();
    w.columns.push({ id: 'crm_id', title: 'CRM ID', kind: 'text', width: 180 });
    const saved = saveCrmMapping(w, {
      id: 'hs',
      name: 'HubSpot accounts',
      config: { ...config, idColumn: 'crm_id' },
    });
    for (const id of ['company', 'domain', 'crm_id']) {
      expect(findColumnDependencies(saved, id)).toContainEqual({
        ownerId: 'hs',
        ownerTitle: 'HubSpot accounts',
        relationship: 'saved CRM mapping',
      });
      expect(() => deleteWorkspaceColumn(saved, id)).toThrow(
        'HubSpot accounts',
      );
    }
    expect(
      deleteWorkspaceColumn(
        removeCrmMapping(saved, 'hs'),
        'crm_id',
      ).columns.some((c) => c.id === 'crm_id'),
    ).toBe(false);
    expect(removeCrmMapping(saved, 'hs').rows).toEqual(saved.rows);
  });
});

describe('verified CRM ID capture', () => {
  it('adds a text ID column before status and makes the saved mapping use verified IDs', () => {
    const w = saveCrmMapping(workspace(), {
      id: 'hs',
      name: 'HubSpot accounts',
      config,
    });
    const result = copyVerifiedCrmIds(w, receipt());
    expect(result.copied).toBe(2);
    expect(result.issues).toEqual([]);
    expect(result.workspace.columns.slice(-2).map((c) => c.id)).toEqual([
      'crm_hubspot_company_id',
      'status',
    ]);
    expect(result.workspace.rows.map((r) => r.values[result.idColumn])).toEqual(
      ['101', '102'],
    );
    expect(result.workspace.crmMappings![0].config.idColumn).toBe(
      result.idColumn,
    );
    expect(w.rows[0].values).not.toHaveProperty(result.idColumn);
    const repeated = copyVerifiedCrmIds(result.workspace, receipt());
    expect(repeated.workspace.columns).toEqual(result.workspace.columns);
    expect(repeated.workspace.rows).toEqual(result.workspace.rows);
  });
  it('copies partial successes without trusting uncertain or failed writes', () => {
    const plan = receipt();
    plan.status = 'review';
    plan.actions[1].status = 'uncertain';
    const result = copyVerifiedCrmIds(workspace(), plan);
    expect(result.copied).toBe(1);
    expect(result.issues).toEqual([
      expect.stringContaining('Beta: no verified'),
    ]);
    expect(result.workspace.rows[1].values[result.idColumn]).toBe('');
  });
  it('leaves changed rows, deleted rows and conflicting IDs untouched', () => {
    const w = workspace();
    w.rows[0].values.domain = 'someone-else.example';
    w.rows[1].values.crm_hubspot_company_id = '999';
    w.columns.push({
      id: 'crm_hubspot_company_id',
      title: 'HubSpot ID',
      kind: 'text',
      width: 180,
    });
    const result = copyVerifiedCrmIds(w, receipt());
    expect(result.copied).toBe(0);
    expect(result.workspace).toBe(w);
    expect(result.issues).toEqual([
      expect.stringContaining('mapped values changed'),
      expect.stringContaining('different CRM ID'),
    ]);
    w.rows = [];
    expect(copyVerifiedCrmIds(w, receipt()).issues).toEqual([
      expect.stringContaining('row no longer exists'),
      expect.stringContaining('row no longer exists'),
    ]);
  });
  it('rejects another table and refuses to write IDs over formula or mapped input columns', () => {
    const plan = receipt();
    expect(() =>
      copyVerifiedCrmIds({ ...workspace(), id: 'other' }, plan),
    ).toThrow('another table');
    expect(() =>
      copyVerifiedCrmIds(workspace(), {
        ...plan,
        config: { ...config, idColumn: 'company' },
      }),
    ).toThrow('separate column');
    const w = workspace();
    w.columns.push({
      id: 'crm_hubspot_company_id',
      title: 'Computed',
      kind: 'formula',
      recipe: 'first-name',
      width: 180,
    });
    expect(() => copyVerifiedCrmIds(w, plan)).toThrow('text column');
  });
  it('retains explicit ID columns and mappings across CRM refreshes', () => {
    const w = workspace();
    w.columns.push({ id: 'crm_id', title: 'CRM ID', kind: 'text', width: 180 });
    const cfg = { ...config, idColumn: 'crm_id' };
    const saved = saveCrmMapping(w, {
      id: 'hs',
      name: 'HubSpot accounts',
      config: cfg,
    });
    const result = copyVerifiedCrmIds(saved, { ...receipt(), config: cfg });
    expect(result.idColumn).toBe('crm_id');
    const refreshed = applyCrmImport(
      result.workspace,
      {
        provider: 'hubspot',
        sourceLabel: 'HubSpot companies',
        truncated: false,
        readAt: new Date().toISOString(),
        contacts: [],
      },
      'append',
    );
    expect(refreshed.crmMappings).toEqual(result.workspace.crmMappings);
    expect(refreshed.rows.map((r) => r.values.crm_id)).toEqual(['101', '102']);
  });
});
