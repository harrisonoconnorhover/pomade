import { describe, expect, it } from 'vitest';

import { createSampleWorkspace } from './sample-workspace';
import {
  applyWebResearchResult,
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
