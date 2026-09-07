import { describe, it, expect } from 'vitest';
import { previewRun } from './run-preview';
import { createTable } from './workbook';
import { createProviderWaterfall } from './provider-waterfall';
import { emailProviderStep } from './provider-presets';
const w = () => {
  const t = createTable({ id: 'test', name: 'Test', mode: 'empty' });
  t.rows = [
    {
      id: 'a',
      values: {
        company: 'Example',
        person: 'Ada',
        domain: 'example.com',
        qualified: 'no',
      },
    },
    {
      id: 'b',
      values: {
        company: 'Second',
        person: '',
        domain: 'example.org',
        qualified: 'yes',
      },
    },
  ];
  t.columns.push(
    ...createProviderWaterfall(t, {
      id: 'found_email',
      title: 'Email',
      accept: 'verified-email',
      continueOnError: false,
      steps: [
        {
          ...emailProviderStep('hunter', 'person', 'domain'),
          verifier: { presetId: 'hunter-verify' },
        },
        emailProviderStep('prospeo', 'person', 'domain'),
      ],
    }),
  );
  return t;
};
const connected = {
  http: ['pomade_hunter', 'pomade_prospeo'].map((id) => ({
    id,
    label: id,
    origin: 'https://example.test',
    methods: ['GET' as const],
  })),
  research: { provider: 'parallel', configured: true },
};
describe('run preview', () => {
  it('shows finder/verifier order, missing inputs and missing fallback connections without reducing the consent ceiling', () => {
    const t = w();
    const connections = {
      http: [
        {
          id: 'pomade_hunter',
          label: 'Hunter',
          origin: 'https://api.hunter.io',
          methods: ['GET' as const],
        },
      ],
    };
    const entries = previewRun(t, ['a', 'b'], ['found_email'], connections);
    expect(entries[0]).toMatchObject({
      state: 'setup',
      maximum: 3,
      steps: [
        'Hunter',
        'Hunter verification (if a candidate is found)',
        'Prospeo',
      ],
    });
    expect(entries[1].details.join(' ')).toContain('blank Person');
  });
  it('distinguishes a stable false condition from an upstream-dependent condition or input', () => {
    const t = w();
    const c = t.columns.find((c) => c.id === 'found_email')!;
    c.runCondition = { field: 'qualified', operator: 'equals', value: 'yes' };
    expect(previewRun(t, ['a'], ['found_email'], {})[0].state).toBe('skipped');
    t.columns.unshift({
      id: 'qualified',
      title: 'Qualification',
      kind: 'formula',
      recipe: 'custom-formula',
      expression: 'yes',
      width: 100,
    });
    expect(
      previewRun(t, ['a'], ['qualified', 'found_email'], connected)[0].state,
    ).toBe('dependent');
    t.columns.unshift({
      id: 'person',
      title: 'Person',
      kind: 'enrichment',
      recipe: 'web-research',
      prompt: 'Find a person',
      width: 100,
    });
    const p = previewRun(t, ['b'], ['person', 'found_email'], connected);
    expect(p[1].state).toBe('dependent');
    expect(p[1].details.join(' ')).toContain('waiting for Person');
  });
  it('marks generated children skipped for the list that produced them', () => {
    const t = w();
    t.columns = [
      {
        id: 'people',
        title: 'People',
        kind: 'enrichment',
        recipe: 'web-research',
        outputCardinality: 'list',
        width: 100,
      },
    ];
    t.rows[0].generatedByColumnId = 'people';
    expect(previewRun(t, ['a'], ['people'], {})[0]).toMatchObject({
      state: 'skipped',
      maximum: 0,
    });
  });
  it('does not claim readiness while connections are unknown and keeps empty scope empty', () => {
    const t = w();
    expect(previewRun(t, ['a'], ['found_email'], {})[0].state).toBe(
      'unchecked',
    );
    expect(previewRun(t, ['a'], ['found_email'], { http: [] })[0].state).toBe(
      'setup',
    );
    expect(previewRun(t, ['a'], ['found_email'], connected)[0].state).toBe(
      'ready',
    );
    expect(previewRun(t, ['b'], ['found_email'], connected)[0].state).toBe(
      'input',
    );
    expect(previewRun(t, ['a'], [], connected)).toEqual([]);
  });
});
