import { describe, it, expect, vi } from 'vitest';
import {
  CrmSyncClient,
  previewCrmSync,
  crmConnectionFingerprint,
  crmPreviewConnectionMatches,
  executeCrmAction,
  type CrmSyncConfig,
} from './crm-sync';
import { createTable } from './workbook';
const config: CrmSyncConfig = {
  provider: 'hubspot',
  objectType: 'company',
  mapping: { name: 'company', domain: 'domain' },
};
const workspace = () => {
  const w = createTable({ id: 'test', name: 'Test', mode: 'empty', now: 1 });
  w.rows = [{ id: 'r', values: { company: 'Example', domain: 'example.com' } }];
  return w;
};
describe('CRM writes', () => {
  it('previews a create without writing then verifies its native ID and values', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(Response.json({ id: '123' }))
      .mockResolvedValueOnce(
        Response.json({
          properties: { name: 'Example', domain: 'example.com' },
        }),
      );
    const options = {
      hubSpotAccessToken: 'test',
      fetchImpl: fetchImpl as typeof fetch,
    };
    const plan = await previewCrmSync(workspace(), ['r'], config, options);
    expect(plan.actions[0].action).toBe('create');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const result = await executeCrmAction(
      plan.actions[0],
      new CrmSyncClient(config, options),
    );
    expect(result).toMatchObject({ status: 'verified', nativeId: '123' });
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body)).toEqual({
      properties: { name: 'Example', domain: 'example.com' },
    });
  });
  it('reviews ambiguous company matches without choosing the first', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json({ results: [{ id: '1' }, { id: '2' }] }),
      );
    const plan = await previewCrmSync(workspace(), ['r'], config, {
      hubSpotAccessToken: 'test',
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(plan.actions[0]).toMatchObject({
      action: 'review',
      message: expect.stringContaining('Multiple'),
    });
  });
  it('skips blanks and refuses to overwrite a record changed since preview', async () => {
    const w = workspace();
    w.columns.push({
      id: 'description',
      title: 'Description',
      kind: 'text',
      width: 100,
    });
    w.rows[0].values.description = '';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ results: [{ id: '1' }] }))
      .mockResolvedValueOnce(
        Response.json({ properties: { name: 'Old', domain: 'example.com' } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          properties: { name: 'Edited elsewhere', domain: 'example.com' },
        }),
      );
    const cfg = {
        ...config,
        mapping: { ...config.mapping, description: 'description' },
      },
      options = {
        hubSpotAccessToken: 'test',
        fetchImpl: fetchImpl as typeof fetch,
      };
    const plan = await previewCrmSync(w, ['r'], cfg, options);
    expect(plan.actions[0].properties).not.toHaveProperty('description');
    expect(
      (await executeCrmAction(plan.actions[0], new CrmSyncClient(cfg, options)))
        .status,
    ).toBe('failed');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('does not duplicate a contact that appears between preview and create', async () => {
    const cfg: CrmSyncConfig = {
        provider: 'hubspot',
        objectType: 'contact',
        mapping: { email: 'email' },
      },
      w = workspace();
    w.rows[0].values.email = 'ada@example.com';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(Response.json({ id: '3' }));
    const options = {
      hubSpotAccessToken: 'test',
      fetchImpl: fetchImpl as typeof fetch,
    };
    const plan = await previewCrmSync(w, ['r'], cfg, options);
    const result = await executeCrmAction(
      plan.actions[0],
      new CrmSyncClient(cfg, options),
    );
    expect(result.status).toBe('failed');
    expect(result.message).toContain('appeared');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('marks an ambiguous write as uncertain and never retries automatically', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockRejectedValueOnce(new Error('Connection lost'));
    const options = {
      hubSpotAccessToken: 'test',
      fetchImpl: fetchImpl as typeof fetch,
    };
    const plan = await previewCrmSync(workspace(), ['r'], config, options);
    expect(
      (
        await executeCrmAction(
          plan.actions[0],
          new CrmSyncClient(config, options),
        )
      ).status,
    ).toBe('uncertain');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('keeps a successful write with a failed read-back uncertain, including HTTP 403', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(Response.json({ id: '123' }))
      .mockResolvedValueOnce(
        Response.json({ message: 'Read scope unavailable' }, { status: 403 }),
      );
    const options = {
      hubSpotAccessToken: 'test',
      fetchImpl: fetchImpl as typeof fetch,
    };
    const plan = await previewCrmSync(workspace(), ['r'], config, options);
    const result = await executeCrmAction(
      plan.actions[0],
      new CrmSyncClient(config, options),
    );
    expect(result).toMatchObject({ status: 'uncertain', nativeId: '123' });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
  it('writes a Salesforce Contact and preserves its AccountId', async () => {
    const cfg: CrmSyncConfig = {
      provider: 'salesforce',
      objectType: 'contact',
      mapping: {
        LastName: 'person',
        Email: 'email',
        AccountId: 'crm_account_id',
      },
    };
    const w = workspace();
    w.columns.push({
      id: 'crm_account_id',
      title: 'Account ID',
      kind: 'text',
      width: 100,
    });
    w.rows[0].values = {
      person: 'Lovelace',
      email: 'ada@example.com',
      crm_account_id: '001000000000001AAA',
    };
    const properties = {
      LastName: 'Lovelace',
      Email: 'ada@example.com',
      AccountId: '001000000000001AAA',
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ records: [] }))
      .mockResolvedValueOnce(Response.json({ records: [] }))
      .mockResolvedValueOnce(
        Response.json({ id: '003000000000001AAA', success: true }),
      )
      .mockResolvedValueOnce(Response.json(properties));
    const options = {
      salesforceAccessToken: 'test',
      salesforceInstanceUrl: 'https://dev.my.salesforce.com',
      fetchImpl: fetchImpl as typeof fetch,
    };
    const plan = await previewCrmSync(w, ['r'], cfg, options);
    expect(
      (await executeCrmAction(plan.actions[0], new CrmSyncClient(cfg, options)))
        .status,
    ).toBe('verified');
    expect(fetchImpl.mock.calls[2][0]).toContain('/sobjects/Contact');
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body)).toEqual(properties);
  });
});

describe('contacts without email', () => {
  it('matches HubSpot people by full name AND company website, keeping different people separate', async () => {
    const w = workspace();
    w.columns.push(
      ...['firstname', 'lastname'].map((id) => ({
        id,
        title: id,
        kind: 'text' as const,
        width: 120,
      })),
    );
    w.rows = [
      {
        id: 'a',
        values: {
          firstname: 'Ada',
          lastname: 'Lovelace',
          domain: 'example.com',
        },
      },
      {
        id: 'b',
        values: {
          firstname: 'Grace',
          lastname: 'Hopper',
          domain: 'example.com',
        },
      },
    ];
    const cfg: CrmSyncConfig = {
      provider: 'hubspot',
      objectType: 'contact',
      mapping: {
        firstname: 'firstname',
        lastname: 'lastname',
        website: 'domain',
      },
    };
    const fetchImpl = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ results: [] })),
      );
    const plan = await previewCrmSync(w, ['a', 'b'], cfg, {
      hubSpotAccessToken: 'test',
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(plan.actions.map((a) => a.action)).toEqual(['create', 'create']);
    expect(
      JSON.parse(fetchImpl.mock.calls[0][1].body).filterGroups[0].filters,
    ).toEqual(
      expect.arrayContaining([
        {
          propertyName: 'website',
          operator: 'IN',
          values: expect.arrayContaining([
            'example.com',
            'http://example.com',
            'https://example.com',
          ]),
        },
        { propertyName: 'firstname', operator: 'EQ', value: 'Ada' },
        { propertyName: 'lastname', operator: 'EQ', value: 'Lovelace' },
      ]),
    );
  });
  it('refuses a name-only person match without company context', async () => {
    const w = workspace();
    w.columns.push(
      ...['firstname', 'lastname'].map((id) => ({
        id,
        title: id,
        kind: 'text' as const,
        width: 120,
      })),
    );
    w.rows[0].values = { firstname: 'Ada', lastname: 'Lovelace' };
    const fetchImpl = vi.fn();
    const plan = await previewCrmSync(
      w,
      ['r'],
      {
        provider: 'salesforce',
        objectType: 'contact',
        mapping: { FirstName: 'firstname', LastName: 'lastname' },
      },
      {
        salesforceAccessToken: 'test',
        salesforceInstanceUrl: 'https://dev.my.salesforce.com',
        fetchImpl: fetchImpl as typeof fetch,
      },
    );
    expect(plan.actions[0].action).toBe('review');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('CRM URL normalization', () => {
  it('accepts HubSpot adding a URL scheme and records returned values', async () => {
    const config: CrmSyncConfig = {
      provider: 'hubspot',
      objectType: 'contact',
      mapping: {},
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          id: '9',
          properties: { website: 'http://example.com' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: '9',
          properties: { website: 'http://example.com' },
        }),
      );
    const action = {
      rowId: 'r',
      label: 'Ada',
      nativeId: '9',
      action: 'unchanged' as const,
      status: 'pending' as const,
      properties: { website: 'example.com' },
      before: { website: 'http://example.com' },
    };
    const result = await executeCrmAction(
      action,
      new CrmSyncClient(config, {
        hubSpotAccessToken: 'test',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    );
    expect(result.status).toBe('verified');
    expect(result.observed).toEqual({ website: 'http://example.com' });
  });
});

it('binds a CRM preview to the connection used to create it', async () => {
  const options = {
    hubSpotAccessToken: 'test',
    fetchImpl: vi
      .fn()
      .mockResolvedValue(Response.json({ results: [] })) as typeof fetch,
  };
  const plan = await previewCrmSync(workspace(), ['r'], config, options);
  expect(await crmPreviewConnectionMatches(plan, options)).toBe(true);
  expect(
    await crmPreviewConnectionMatches(plan, {
      ...options,
      hubSpotAccessToken: 'different-account',
    }),
  ).toBe(false);
  expect(
    await crmPreviewConnectionMatches(
      { ...plan, connectionFingerprint: undefined },
      options,
    ),
  ).toBe(false);
  const sf = {
    salesforceInstanceUrl: 'https://example.my.salesforce.com',
    salesforceAccessToken: 'first',
  };
  expect(await crmConnectionFingerprint('salesforce', sf)).not.toBe(
    await crmConnectionFingerprint('salesforce', {
      ...sf,
      salesforceAccessToken: 'second',
    }),
  );
});
