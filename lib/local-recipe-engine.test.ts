import { describe, expect, it } from 'vitest';

import { toControlTowerPreview } from './control-tower-adapter';
import { executeWorkspace } from './local-recipe-engine';
import { createSampleWorkspace } from './sample-workspace';
import { toScoutboundPipeline } from './scoutbound-adapter';

describe('Pomade recipe execution', () => {
  it('runs every configured recipe and produces a non-writing receipt', () => {
    const workspace = createSampleWorkspace();
    const result = executeWorkspace(workspace);

    expect(result.run.status).toBe('completed');
    expect(result.run.rowCount).toBe(10);
    expect(result.run.actionCount).toBe(20);
    expect(result.run.externalWrites).toBe(0);
    expect(result.workspace.rows[0].values.fit).toMatch(/^(Strong|Review) · \d+$/);
    expect(result.workspace.rows[0].values.opener).toContain('Mercury');
  });

  it('normalizes a domain through a formula column', () => {
    const workspace = createSampleWorkspace();
    workspace.columns.push({
      id: 'clean_domain',
      title: 'Clean domain',
      kind: 'formula',
      recipe: 'normalize-domain',
      width: 180,
    });
    workspace.rows[0].values.domain = 'HTTPS://WWW.MERCURY.COM/about';

    const result = executeWorkspace(workspace);

    expect(result.workspace.rows[0].values.clean_domain).toBe('mercury.com');
  });

  it('maps the visual columns onto the Scoutbound adapter contract', () => {
    const pipeline = toScoutboundPipeline(createSampleWorkspace());

    expect(pipeline.tab).toBe('Founder targets');
    expect(pipeline.actions).toEqual([
      expect.objectContaining({ id: 'fit', type: 'ai', recipe: 'score-fit' }),
      expect.objectContaining({ id: 'opener', type: 'ai', recipe: 'write-opener' }),
    ]);
  });

  it('hands Control Tower a bounded preview plan rather than a write command', () => {
    const workspace = createSampleWorkspace();
    const plan = toControlTowerPreview(workspace, [workspace.rows[0].id]);

    expect(plan.mode).toBe('preview');
    expect(plan.guards).toEqual({ maxRecords: 100, allowCreate: false });
    expect(plan.records).toHaveLength(1);
    expect(plan.records[0].externalKey).toBe('mercury.com');
    expect(plan.records[0].proposedFields).not.toHaveProperty('status');
  });
});
