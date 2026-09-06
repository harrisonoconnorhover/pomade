import { describe, expect, it } from 'vitest';

import { createSampleWorkspace } from './sample-workspace';
import {
  applyWebResearchResult,
  parseListResearchAnswer,
  parseStructuredResearchAnswer,
  renderWebResearchPrompt,
  webResearchCacheKey,
} from './web-research';

describe('web research recipe', () => {
  it('parses a complete JSON list before appended citation brackets', () => {
    const fields = [
      { id: 'person', title: 'Person', valueType: 'text' as const },
    ];
    const answer =
      JSON.stringify([{ person: 'Ada [platform] "Lead"' }]) +
      '\nSources: [Company](https://example.com)';
    expect(parseListResearchAnswer(answer, fields)).toEqual({
      valid: true,
      items: [{ person: 'Ada [platform] "Lead"' }],
    });
    expect(parseListResearchAnswer('[{"person":"Ada"}', fields)?.valid).toBe(
      false,
    );
  });

  it('renders row variables and includes bounded research context', () => {
    const row = createSampleWorkspace().rows[0];
    const prompt = renderWebResearchPrompt(
      'Find a recent trigger for {{company}} at {{domain}}.',
      row,
    );

    expect(prompt).toContain(
      'Find a recent trigger for Mercury at mercury.com.',
    );
    expect(prompt).toContain('Company: Mercury');
    expect(prompt).toContain('Return a direct answer in 90 words or fewer.');
  });

  it('stores the answer and clickable source metadata in the receipt', () => {
    const workspace = createSampleWorkspace();
    const column = {
      id: 'recent_trigger',
      title: 'Recent trigger',
      kind: 'enrichment' as const,
      recipe: 'web-research' as const,
      prompt: 'Find a recent trigger for {{company}}.',
      width: 340,
    };
    workspace.columns.splice(-1, 0, column);
    workspace.rows[0].values.recent_trigger = '';

    const result = applyWebResearchResult(
      workspace,
      workspace.rows[0].id,
      column,
      {
        answer: 'Mercury announced a new product.',
        citations: [
          { title: 'Mercury newsroom', url: 'https://mercury.com/news' },
        ],
        queries: ['Mercury latest product announcement'],
        model: 'model-a',
        reasoningEffort: 'high',
        cached: false,
      },
      Date.now() - 20,
      'parallel',
    );

    expect(result.workspace.rows[0].values.recent_trigger).toBe(
      'Mercury announced a new product.',
    );
    expect(result.receipt).toMatchObject({
      provider: 'parallel',
      researchModel: 'model-a',
      reasoningEffort: 'high',
      status: 'passed',
      references: [
        { title: 'Mercury newsroom', url: 'https://mercury.com/news' },
      ],
      queries: ['Mercury latest product announcement'],
    });
  });

  it('asks for a complete typed JSON object when fields are configured', () => {
    const row = createSampleWorkspace().rows[0];
    const prompt = renderWebResearchPrompt('Research {{company}}.', row, [
      { id: 'trigger', title: 'Recent trigger', valueType: 'text' },
      { id: 'trigger_date', title: 'Trigger date', valueType: 'date' },
      { id: 'confidence', title: 'Confidence', valueType: 'number' },
      { id: 'verified', title: 'Verified', valueType: 'boolean' },
    ]);

    expect(prompt).toContain('Return only one valid JSON object');
    expect(prompt).toContain('"trigger_date" (date): Trigger date');
    expect(prompt).toContain('numbers must be JSON numbers');
  });

  it('asks for a bounded JSON array when list rows are configured', () => {
    const row = createSampleWorkspace().rows[0];
    const prompt = renderWebResearchPrompt(
      'Find companies like {{company}}.',
      row,
      [
        { id: 'found_company', title: 'Company name', valueType: 'text' },
        { id: 'found_domain', title: 'Domain', valueType: 'text' },
      ],
      undefined,
      'list',
      7,
    );

    expect(prompt).toContain(
      'Return only one valid JSON array containing at most 7 objects',
    );
    expect(prompt).toContain('Fields for each result:');
  });

  it('renders reusable research inputs through their selected columns', () => {
    const row = {
      id: 'row-1',
      values: {
        account_name: 'Acme',
        website: 'acme.example',
      },
    };
    const prompt = renderWebResearchPrompt(
      'Research {{company}}.',
      row,
      undefined,
      { company: 'account_name', domain: 'website' },
    );

    expect(prompt).toContain('Research Acme.');
    expect(prompt).toContain('Company: Acme');
    expect(prompt).toContain('Domain: acme.example');
  });

  it('parses fenced provider JSON into typed grid values', () => {
    const parsed = parseStructuredResearchAnswer(
      '```json\n{"trigger":"Series C","trigger_date":"2026-08-14T00:00:00Z","confidence":0.92,"verified":true}\n```',
      [
        { id: 'trigger', title: 'Recent trigger', valueType: 'text' },
        { id: 'trigger_date', title: 'Trigger date', valueType: 'date' },
        { id: 'confidence', title: 'Confidence', valueType: 'number' },
        { id: 'verified', title: 'Verified', valueType: 'boolean' },
      ],
    );

    expect(parsed).toEqual({
      valid: true,
      values: {
        trigger: 'Series C',
        trigger_date: '2026-08-14',
        confidence: '0.92',
        verified: 'Yes',
      },
    });
  });

  it('rejects an invalid typed value even when every key is present', () => {
    expect(
      parseStructuredResearchAnswer('{"confidence":"high"}', [
        { id: 'confidence', title: 'Confidence', valueType: 'number' },
      ]),
    ).toEqual({ valid: false, values: { confidence: '' } });
  });

  it('parses and caps list-valued research output', () => {
    const parsed = parseListResearchAnswer(
      '[{"company":"Acme","employees":42},{"company":"Bravo","employees":"91"},{"company":"Ignored","employees":12}]',
      [
        { id: 'company', title: 'Company', valueType: 'text' },
        { id: 'employees', title: 'Employees', valueType: 'number' },
      ],
      2,
    );

    expect(parsed).toEqual({
      valid: true,
      items: [
        { company: 'Acme', employees: '42' },
        { company: 'Bravo', employees: '91' },
      ],
    });
    expect(
      parseListResearchAnswer('[{"company":"Acme","employees":"many"}]', [
        { id: 'company', title: 'Company', valueType: 'text' },
        { id: 'employees', title: 'Employees', valueType: 'number' },
      ]),
    ).toEqual({ valid: false, items: [] });
  });

  it('writes one research response across several output columns', () => {
    const workspace = createSampleWorkspace();
    const column = {
      id: 'trigger',
      title: 'Recent trigger',
      kind: 'enrichment' as const,
      recipe: 'web-research' as const,
      prompt: 'Find a recent trigger for {{company}}.',
      width: 300,
      outputFields: [
        { id: 'trigger', title: 'Recent trigger', valueType: 'text' as const },
        {
          id: 'trigger_date',
          title: 'Trigger date',
          valueType: 'date' as const,
        },
        {
          id: 'confidence',
          title: 'Confidence',
          valueType: 'number' as const,
        },
      ],
    };
    workspace.columns.splice(
      -1,
      0,
      column,
      {
        id: 'trigger_date',
        title: 'Trigger date',
        kind: 'text',
        width: 160,
        valueType: 'date',
      },
      {
        id: 'confidence',
        title: 'Confidence',
        kind: 'text',
        width: 140,
        valueType: 'number',
      },
    );

    const result = applyWebResearchResult(
      workspace,
      workspace.rows[0].id,
      column,
      {
        answer:
          '{"trigger":"Mercury launched invoicing","trigger_date":"2026-08-14","confidence":91}',
        citations: [
          { title: 'Mercury newsroom', url: 'https://mercury.com/news' },
        ],
        queries: ['Mercury latest product'],
        model: 'speed',
        cached: false,
      },
      Date.now() - 20,
      'parallel',
    );

    expect(result.workspace.rows[0].values).toMatchObject({
      trigger: 'Mercury launched invoicing',
      trigger_date: '2026-08-14',
      confidence: '91',
    });
    expect(result.receipt).toMatchObject({
      status: 'passed',
      outputValues: {
        trigger: 'Mercury launched invoicing',
        trigger_date: '2026-08-14',
        confidence: '91',
      },
    });
  });

  it('retains malformed output in raw evidence and clears structured fields for review', () => {
    const workspace = createSampleWorkspace();
    const column = {
      id: 'trigger',
      title: 'Recent trigger',
      kind: 'enrichment' as const,
      recipe: 'web-research' as const,
      prompt: 'Research {{company}}.',
      width: 300,
      outputFields: [
        { id: 'trigger', title: 'Recent trigger', valueType: 'text' as const },
        { id: 'verified', title: 'Verified', valueType: 'boolean' as const },
      ],
    };
    workspace.columns.splice(-1, 0, column);

    const result = applyWebResearchResult(
      workspace,
      workspace.rows[0].id,
      column,
      {
        answer: 'The provider returned prose instead of JSON.',
        citations: [{ title: 'Source', url: 'https://example.com' }],
        queries: [],
        model: 'speed',
        cached: false,
      },
      Date.now() - 20,
      'parallel',
    );

    expect(result.workspace.rows[0].values.trigger).toBe('');
    expect(result.workspace.rows[0].values.verified).toBe('');
    expect(result.workspace.rows[0].values.__research_trigger_raw).toBe(
      'The provider returned prose instead of JSON.',
    );
    expect(result.receipt.status).toBe('review');
  });

  it('expands list research into replaceable child rows with provenance', () => {
    const workspace = createSampleWorkspace();
    const column = {
      id: 'found_company',
      title: 'Company name',
      kind: 'enrichment' as const,
      recipe: 'web-research' as const,
      prompt: 'Find companies like {{company}}.',
      outputCardinality: 'list' as const,
      listLimit: 5,
      listDestinationBindings: {
        found_company: 'company',
        found_domain: 'domain',
      },
      width: 260,
      outputFields: [
        {
          id: 'found_company',
          title: 'Company name',
          valueType: 'text' as const,
        },
        { id: 'found_domain', title: 'Domain', valueType: 'text' as const },
      ],
    };
    workspace.columns.splice(-1, 0, column, {
      id: 'found_domain',
      title: 'Domain',
      kind: 'text',
      width: 220,
    });

    const first = applyWebResearchResult(
      workspace,
      workspace.rows[0].id,
      column,
      {
        answer:
          '[{"found_company":"Acme","found_domain":"acme.example"},{"found_company":"Bravo","found_domain":"bravo.example"}]',
        citations: [{ title: 'Company directory', url: 'https://example.com' }],
        queries: ['companies like Mercury'],
        model: 'speed',
        cached: false,
      },
      Date.now() - 20,
      'parallel',
    );

    expect(first.workspace.rows[0].id).toBe('sample-1');
    expect(first.workspace.rows.slice(1, 3)).toMatchObject([
      {
        parentRowId: 'sample-1',
        generatedByColumnId: 'found_company',
        values: {
          company: 'Acme',
          domain: 'acme.example',
          found_company: 'Acme',
          found_domain: 'acme.example',
        },
      },
      {
        parentRowId: 'sample-1',
        generatedByColumnId: 'found_company',
        values: {
          company: 'Bravo',
          domain: 'bravo.example',
          found_company: 'Bravo',
          found_domain: 'bravo.example',
        },
      },
    ]);
    expect(first.receipt).toMatchObject({
      status: 'passed',
      createdRowCount: 2,
      createdRowIds: [
        'sample-1__found_company__1',
        'sample-1__found_company__2',
      ],
      after: '2 rows created',
    });

    const rerun = applyWebResearchResult(
      first.workspace,
      'sample-1',
      column,
      {
        answer:
          '[{"found_company":"Charlie","found_domain":"charlie.example"}]',
        citations: [
          { title: 'Updated directory', url: 'https://example.com/new' },
        ],
        queries: ['updated companies like Mercury'],
        model: 'speed',
        cached: false,
      },
      Date.now() - 20,
      'parallel',
    );
    const children = rerun.workspace.rows.filter(
      (row) => row.parentRowId === 'sample-1',
    );

    expect(children).toHaveLength(1);
    expect(children[0].values.found_company).toBe('Charlie');
    expect(rerun.receipt.before).toBe('2 generated rows');

    const invalid = applyWebResearchResult(
      rerun.workspace,
      'sample-1',
      column,
      {
        answer: 'The provider returned prose instead of the requested list.',
        citations: [{ title: 'Source', url: 'https://example.com' }],
        queries: [],
        model: 'speed',
        cached: false,
      },
      Date.now() - 20,
      'parallel',
    );

    expect(
      invalid.workspace.rows.filter((row) => row.parentRowId === 'sample-1'),
    ).toHaveLength(1);
    expect(invalid.receipt).toMatchObject({
      status: 'review',
      after: 'Output needs review · existing rows preserved',
    });
  });

  it('uses model and prompt in a stable privacy-safe cache key', async () => {
    await expect(
      webResearchCacheKey('gemini-3.8-flash', 'Research Mercury'),
    ).resolves.toMatch(/^[a-f0-9]{64}$/);
    await expect(
      webResearchCacheKey('GEMINI-3.8-FLASH', 'Research Mercury'),
    ).resolves.toBe(
      await webResearchCacheKey('gemini-3.8-flash', 'Research Mercury'),
    );
  });
});
