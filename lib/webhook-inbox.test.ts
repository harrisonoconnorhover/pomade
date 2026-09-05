import { describe, it, expect } from 'vitest';
import {
  saveWebhookMapping,
  webhookRecords,
  webhookSources,
  importWebhookEvents,
  type WebhookEvent,
} from './webhook-inbox';
import { createTable } from './workbook';
const event: WebhookEvent = {
  id: 'event1',
  sourceId: 'leads',
  receivedAt: 1,
  records: [
    {
      company: { name: 'Example' },
      domain: 'example.com',
      active: false,
      count: 0,
    },
  ],
};
const table = () => createTable({ id: 'test', name: 'Test', mode: 'empty' });
describe('webhook inbox', () => {
  it('persists separate source mappings and rejects deleted destinations', () => {
    const first = saveWebhookMapping(table(), 'crm', {
      company: 'account.name',
    });
    const second = saveWebhookMapping(first, 'form', {
      email: 'contact.email',
    });
    expect(second.webhookMappings).toEqual({
      crm: { company: 'account.name' },
      form: { email: 'contact.email' },
    });
    const reloaded = JSON.parse(JSON.stringify(second));
    expect(
      importWebhookEvents(
        reloaded,
        [{ ...event, records: [{ account: { name: 'Saved' } }] }],
        reloaded.webhookMappings.crm,
      ).workspace.rows[0].values.company,
    ).toBe('Saved');
    reloaded.columns = reloaded.columns.filter(
      (c: { id: string }) => c.id !== 'company',
    );
    expect(() =>
      importWebhookEvents(reloaded, [event], reloaded.webhookMappings.crm),
    ).toThrow();
    expect(first.webhookMappings).not.toHaveProperty('form');
  });
  it('validates configured source boundaries and record batches', () => {
    expect(webhookSources()).toEqual([]);
    expect(() =>
      webhookSources('{"x":{"tableId":"test","token":"short"}}'),
    ).toThrow();
    expect(
      webhookSources(
        JSON.stringify({ x: { tableId: 'test', token: 'a'.repeat(32) } }),
      )[0].id,
    ).toBe('x');
    for (const value of [null, [], [1], Array(101).fill({})])
      expect(() => webhookRecords(value)).toThrow();
    expect(webhookRecords({ name: 'Ada' })).toHaveLength(1);
  });
  it('maps nested fields, preserves existing rows and provenance, and deduplicates imports', () => {
    const w = table();
    w.rows = [{ id: 'existing', values: { company: 'Kept' } }];
    const a = importWebhookEvents(w, [event], {
      company: 'company.name',
      domain: 'domain',
      person: 'active',
      title: 'count',
    });
    expect(a.workspace.rows[0]).toEqual(w.rows[0]);
    expect(a.workspace.rows[1].values).toMatchObject({
      company: 'Example',
      person: 'false',
      title: '0',
    });
    expect(a.workspace.rows[1].webhookSource?.eventId).toBe('event1');
    expect(
      importWebhookEvents(a.workspace, [event], { company: 'company.name' })
        .added,
    ).toBe(0);
  });
  it('rejects bad mappings and empty or oversized results before changing data', () => {
    const w = table();
    for (const mapping of [
      { status: 'domain' },
      { company: 'missing' },
      { company: 'a..b' },
    ] as Record<string, string>[])
      expect(() => importWebhookEvents(w, [event], mapping)).toThrow();
    expect(() =>
      importWebhookEvents(
        w,
        [{ ...event, records: [{ company: 'a'.repeat(4001) }] }],
        { company: 'company' },
      ),
    ).toThrow();
    expect(w.rows).toHaveLength(0);
  });
  it('pauses active schedules when imported rows expand the run scope', () => {
    const w = table();
    w.schedule = {
      id: 's',
      cadence: 'once',
      enabled: true,
      nextRunAt: 1,
      target: 'all',
      confirmExternalResearch: true,
      state: 'active',
      createdAt: 1,
      updatedAt: 1,
    };
    const result = importWebhookEvents(w, [event], { company: 'company.name' });
    expect(result.workspace.schedule?.enabled).toBe(false);
  });
  it('does not run recipes or replace changed imported rows', () => {
    const a = importWebhookEvents(table(), [event], {
      company: 'company.name',
    });
    a.workspace.rows[0].values.company = 'Edited';
    const b = importWebhookEvents(a.workspace, [event, event], {
      company: 'company.name',
    });
    expect(b.skipped).toBe(2);
    expect(b.workspace.rows[0].values.company).toBe('Edited');
  });
});
