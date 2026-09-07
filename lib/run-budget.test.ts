import { describe, it, expect } from 'vitest';
import { runBudget } from './run-budget';
import { emailProviderStep } from './provider-presets';
import type { PomadeColumn } from './pomade-types';
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    values: { company: `Company ${i}` },
  }));
const research: PomadeColumn = {
  id: 'research',
  title: 'Research',
  kind: 'enrichment',
  recipe: 'web-research',
  width: 200,
};
const columns = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ...research, id: `research_${i}` }));
describe('shared provider submission budgets', () => {
  it('offers background when immediate scope is too large', () => {
    expect(runBudget(rows(11), [research])).toMatchObject({
      total: 11,
      immediateAllowed: false,
      backgroundAllowed: true,
    });
  });
  it('allows fifty submissions across five rows but rejects eleven in one row', () => {
    expect(runBudget(rows(5), columns(10))).toMatchObject({
      total: 50,
      backgroundAllowed: true,
    });
    expect(runBudget(rows(1), columns(11))).toMatchObject({
      total: 11,
      backgroundAllowed: false,
    });
    expect(runBudget(rows(1), columns(11)).backgroundIssue).toContain(
      'Company 0',
    );
  });
  it('bounds background rows and rejects empty scope', () => {
    expect(runBudget(rows(101), [research]).backgroundAllowed).toBe(false);
    expect(runBudget(rows(1), []).immediateAllowed).toBe(false);
    expect(runBudget([], [research]).backgroundAllowed).toBe(false);
  });
  it('counts finder and verifier submissions but excludes generated list children', () => {
    const waterfall: PomadeColumn = {
      ...research,
      recipe: 'http-waterfall',
      providerWaterfall: {
        steps: Array.from({ length: 4 }, () => ({
          ...emailProviderStep('hunter', 'person', 'domain'),
          verifier: { presetId: 'hunter-verify' },
        })),
        accept: 'verified-email',
        continueOnError: false,
        winnerColumnId: 'winner',
        statusColumnId: 'state',
      },
    };
    expect(runBudget(rows(1), [waterfall]).total).toBe(8);
    expect(
      runBudget(
        [{ ...rows(1)[0], generatedByColumnId: 'research' }],
        [{ ...research, outputCardinality: 'list' }],
      ).total,
    ).toBe(0);
  });
  it('permits local formulas without provider requests', () => {
    expect(
      runBudget(rows(5), [
        { ...research, kind: 'formula', recipe: 'first-name' },
      ]),
    ).toMatchObject({
      total: 0,
      immediateAllowed: true,
      backgroundAllowed: true,
    });
  });
});
