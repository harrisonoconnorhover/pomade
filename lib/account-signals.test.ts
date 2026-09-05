import { describe, expect, it } from 'vitest';
import {
  addSignalResearch,
  reportedSignalBatch,
  enableSignalFeedFields,
  projectSignalFeed,
} from './account-signals';
import { detectSignalChanges, saveSignalWatch } from './change-signals';
import { createTable } from './workbook';
import { findColumnDependencies } from './column-management';
import { webhookSources } from './webhook-inbox';
function table() {
  const w = createTable({ id: 'signals', name: 'Signals', mode: 'empty' });
  w.rows = [
    { id: 'one', values: { domain: 'example.com', company: 'Example' } },
  ];
  return w;
}
describe('account signals', () => {
  it('compares technology sets independently of order and case, with explicit additions/removals', () => {
    let before = table();
    before.columns.push({
      id: 'tech',
      title: 'Tech',
      kind: 'text',
      width: 160,
    });
    before = saveSignalWatch(before, {
      id: 'tech',
      name: 'Technologies',
      columnId: 'tech',
      kind: 'technology',
      mode: 'set',
      ignoreEmpty: true,
    });
    before.rows[0].values.tech = '["HubSpot", "React"]';
    const after = structuredClone(before);
    after.rows[0].values.tech = '["react", "HubSpot"]';
    expect(
      detectSignalChanges(before, after, { id: 'a', origin: 'Provider' }),
    ).toBeNull();
    after.rows[0].values.tech = '["React", "Salesforce"]';
    expect(
      detectSignalChanges(before, after, { id: 'b', origin: 'Provider' })
        ?.events,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'technology',
          change: 'added',
          after: 'Salesforce',
        }),
        expect.objectContaining({ change: 'removed', before: 'HubSpot' }),
      ]),
    );
    after.rows[0].values.tech = '[malformed';
    expect(
      detectSignalChanges(before, after, { id: 'c', origin: 'Provider' }),
    ).toBeNull();
    after.rows[0].values.tech = '[]';
    expect(
      detectSignalChanges(before, after, { id: 'd', origin: 'Provider' })
        ?.events,
    ).toHaveLength(2);
  });
  it('creates source-linked research checks without calling a provider or claiming disappearances are departures', () => {
    const w = table();
    const next = addSignalResearch(w, 'leadership', 'CTO');
    expect(next.columns).toHaveLength(w.columns.length + 4);
    expect(next.signalWatches?.[0]).toMatchObject({
      kind: 'leadership',
      mode: 'set',
      trackRemovals: false,
      ignoreEmpty: true,
    });
    const watch = next.signalWatches![0];
    expect(findColumnDependencies(next, watch.sourceColumnId!)).toContainEqual(
      expect.objectContaining({ relationship: 'signal watch' }),
    );
    expect(next.columns.find((c) => c.id === watch.columnId)?.prompt).toContain(
      'Do not infer hire dates',
    );
    expect(w.signalWatches).toBeUndefined();
  });
  it('matches reported website/G2/LinkedIn signals to one account and preserves source/event time separately from ingestion', () => {
    const records = ['website', 'g2', 'linkedin'].map((kind) => ({
      domain: 'https://www.example.com/',
      kind,
      summary: 'Fixture: reported engagement',
      url: 'https://example.com/evidence',
      occurredAt: '2026-09-01T12:00:00Z',
    }));
    const batch = reportedSignalBatch(
      table(),
      records,
      'delivery',
      'fixture-source',
      Date.parse('2026-09-05T12:00:00Z'),
    );
    expect(batch.events).toHaveLength(3);
    expect(batch.events[0]).toMatchObject({
      rowId: 'one',
      change: 'reported',
      occurredAt: Date.parse('2026-09-01T12:00:00Z'),
      sourceUrl: 'https://example.com/evidence',
    });
    expect(batch.createdAt).toBeGreaterThan(batch.events[0].occurredAt!);
    const ambiguous = table();
    ambiguous.rows.push({ id: 'two', values: { domain: 'example.com' } });
    expect(() =>
      reportedSignalBatch(ambiguous, records, 'a', 'fixture'),
    ).toThrow('exactly one');
    expect(() =>
      reportedSignalBatch(
        table(),
        [{ ...records[0], url: 'javascript:alert(1)' }],
        'a',
        'fixture',
      ),
    ).toThrow('source URL');
    expect(
      webhookSources(
        JSON.stringify({
          intent: {
            tableId: 'signals',
            token: 'x'.repeat(32),
            mode: 'signals',
          },
        }),
      )[0].mode,
    ).toBe('signals');
  });
});

it('does not turn a source-less research failure into a leadership change', () => {
  const before = addSignalResearch(table(), 'leadership');
  before.rows[0].values.leadership_signals = 'An unstructured failed answer';
  const after = structuredClone(before);
  after.rows[0].values.leadership_signals = 'Ada | CTO';
  after.rows[0].values.leadership_signals_source = 'https://example.com/team';
  expect(
    detectSignalChanges(before, after, { id: 'recovered', origin: 'Research' }),
  ).toBeNull();
});

it('projects account signals into CRM-ready fields without letting late deliveries replace newer events', () => {
  const w = enableSignalFeedFields(table());
  const make = (kind: string, occurredAt: string, summary: string) =>
    reportedSignalBatch(
      w,
      [
        {
          domain: 'example.com',
          kind,
          occurredAt,
          summary,
          url: 'https://example.com/source',
        },
      ],
      kind,
      kind,
      Date.parse('2026-09-05'),
    );
  const newer = make('g2', '2026-09-03', 'Compared products');
  const older = make('website', '2026-09-01', 'Visited pricing');
  const next = projectSignalFeed(w, [newer]);
  const delayed = projectSignalFeed(next, [older]);
  expect(delayed.rows[0].values).toMatchObject({
    signal_latest_kind: 'g2',
    signal_latest_summary: 'Compared products',
    signal_latest_at: '2026-09-03T00:00:00.000Z',
    signal_feed_tags: 'g2;website',
  });
  expect(projectSignalFeed(delayed, [newer, older])).toEqual(delayed);
  expect(w.rows[0].values.signal_latest_kind).toBeUndefined();
  const disabled = enableSignalFeedFields(delayed, false);
  expect(projectSignalFeed(disabled, [newer])).toBe(disabled);
});

it('shows a changed leadership title with its prior title without inventing a promotion or a new person', () => {
  const before = addSignalResearch(table(), 'leadership');
  before.rows[0].values.leadership_signals = 'Ada | CTO; Beth | CFO';
  before.rows[0].values.leadership_signals_source = 'https://example.com/team';
  const after = structuredClone(before);
  after.rows[0].values.leadership_signals =
    'Ada, MBA | CIO; Beth, MBA | CFO; Chris | CEO';
  const events = detectSignalChanges(before, after, {
    id: 'role-change',
    origin: 'Research',
  })!.events;
  expect(events).toHaveLength(2);
  expect(events).toContainEqual(
    expect.objectContaining({
      change: 'changed',
      before: 'Ada | CTO',
      after: 'Ada, MBA | CIO',
    }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({ change: 'added', after: 'Chris | CEO' }),
  );
});

it('keeps a separately delimited hiring URL attached to its job title', () => {
  const before = addSignalResearch(table(), 'hiring');
  before.rows[0].values.hiring_signals = 'Old role: https://example.com/old';
  before.rows[0].values.hiring_signals_source = 'https://example.com/jobs';
  const after = structuredClone(before);
  after.rows[0].values.hiring_signals = 'New role; https://example.com/new';
  const events = detectSignalChanges(before, after, {
    id: 'job-change',
    origin: 'Research',
  })!.events;
  expect(events).toHaveLength(1);
  expect(events[0].after).toBe('New role: https://example.com/new');
});
