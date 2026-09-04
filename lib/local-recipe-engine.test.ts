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
    expect(result.workspace.rows[0].values.fit).toMatch(
      /^(Strong|Review) · \d+$/,
    );
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

  it('runs only selected rows when a row scope is supplied', () => {
    const workspace = createSampleWorkspace();
    const untouched = workspace.rows[1].values.opener;
    workspace.rows[0].values.opener = '';

    const result = executeWorkspace(workspace, ['sample-1']);

    expect(result.run.rowCount).toBe(1);
    expect(result.run.actionCount).toBe(2);
    expect(result.workspace.rows[0].values.opener).toContain('Mercury');
    expect(result.workspace.rows[1].values.opener).toBe(untouched);
  });

  it('builds useful identity helpers without an external provider', () => {
    const workspace = createSampleWorkspace();
    workspace.columns.splice(
      -1,
      0,
      {
        id: 'first',
        title: 'First name',
        kind: 'formula',
        recipe: 'first-name',
        width: 140,
      },
      {
        id: 'key',
        title: 'Dedupe key',
        kind: 'formula',
        recipe: 'dedupe-key',
        width: 240,
      },
    );
    workspace.rows[0].values.email = 'Immad@Mercury.com';

    const result = executeWorkspace(workspace, ['sample-1']);

    expect(result.workspace.rows[0].values.first).toBe('Immad');
    expect(result.workspace.rows[0].values.key).toBe('email:immad@mercury.com');
  });

  it('maps the visual columns onto the Scoutbound adapter contract', () => {
    const pipeline = toScoutboundPipeline(createSampleWorkspace());

    expect(pipeline.tab).toBe('Founder targets');
    expect(pipeline.actions).toEqual([
      expect.objectContaining({ id: 'fit', type: 'ai', recipe: 'score-fit' }),
      expect.objectContaining({
        id: 'opener',
        type: 'ai',
        recipe: 'write-opener',
      }),
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

  it('uses a CRM record identity for a Control Tower handoff when available', () => {
    const workspace = createSampleWorkspace();
    workspace.rows[0].values.crm_source = 'HubSpot contact';
    workspace.rows[0].values.crm_id = '123';
    workspace.rows[0].values.email = 'immad@mercury.com';

    const plan = toControlTowerPreview(workspace, ['sample-1']);

    expect(plan.records[0].externalKey).toBe('HubSpot contact:123');
  });
});
