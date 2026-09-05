import { describe, expect, it } from 'vitest';

import { createSampleWorkspace } from './sample-workspace';
import {
  applyWebResearchResult,
  parseStructuredResearchAnswer,
  renderWebResearchPrompt,
  webResearchCacheKey,
} from './web-research';

describe('web research recipe', () => {
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
        model: 'gemini-3.8-flash',
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

  it('keeps malformed structured output visible but marks it for review', () => {
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

    expect(result.workspace.rows[0].values.trigger).toBe(
      'The provider returned prose instead of JSON.',
    );
    expect(result.receipt.status).toBe('review');
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
