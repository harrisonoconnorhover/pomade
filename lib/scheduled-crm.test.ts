import { describe, expect, it, vi } from 'vitest';
import { runScheduledCrm } from '../db/scheduled-crm';
import { createSampleWorkspace } from './sample-workspace';
import { findColumnDependencies } from './column-management';
import { crmConnectionFingerprint, type CrmSyncPlan } from './crm-sync';

describe('scheduled CRM batch recovery', () => {
  function fixture(status: CrmSyncPlan['status']) {
    const workspace = createSampleWorkspace();
    workspace.revision = 1;
    const config = {
      provider: 'hubspot' as const,
      objectType: 'company' as const,
      mapping: { name: 'company' },
    };
    workspace.schedule = {
      id: 's',
      cadence: 'once',
      state: 'running',
      enabled: false,
      target: 'all',
      confirmExternalResearch: true,
      createdAt: 1,
      updatedAt: 1,
      executionId: 'execution',
      afterRunCrm: [
        {
          mappingId: 'm',
          name: 'Companies',
          config,
          condition: { field: 'domain', operator: 'is_not_empty' },
        },
      ],
    };
    const prior = {
      id: 'schedule-execution-0',
      workspaceId: workspace.id,
      revision: 1,
      config,
      actions: [],
      createdAt: 1,
      status,
    };
    const bind = vi.fn(() => ({
      first: async () => ({ plan: JSON.stringify(prior) }),
    }));
    const db = { prepare: vi.fn(() => ({ bind })) } as unknown as D1Database;
    return { workspace, db, bind, prior };
  }
  it('does not write a completed execution twice and requires review of an uncertain batch', async () => {
    for (const status of ['complete', 'running', 'review'] as const) {
      const { workspace, db, bind } = fixture(status),
        confirm = vi.fn();
      if (status === 'complete')
        expect(
          await runScheduledCrm(db, workspace, undefined, {}, confirm),
        ).toEqual(['schedule-execution-0']);
      else
        await expect(
          runScheduledCrm(db, workspace, undefined, {}, confirm),
        ).rejects.toThrow('needs review');
      expect(confirm).not.toHaveBeenCalled();
      expect(bind).toHaveBeenCalledWith('schedule-execution-0');
    }
  });
  it('resumes a persisted preview once and requires verified completion', async () => {
    const { workspace, db, prior } = fixture('preview');
    const confirm = vi.fn(async () => ({
      ...prior,
      status: 'complete' as const,
    }));
    await runScheduledCrm(db, workspace, undefined, {}, confirm);
    expect(confirm).toHaveBeenCalledExactlyOnceWith('schedule-execution-0');
    await expect(
      runScheduledCrm(db, workspace, undefined, {}, async () => ({
        ...prior,
        status: 'review',
      })),
    ).rejects.toThrow('did not verify');
  });
  it('refreshes a saved but unexecuted preview after a resumed schedule claim changes its revision', async () => {
    const f = fixture('preview');
    const options = {
      hubSpotAccessToken: 'synthetic',
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ results: [] })),
    };
    const prior = {
      ...f.prior,
      revision: 0,
      connectionFingerprint: await crmConnectionFingerprint('hubspot', options),
    };
    f.workspace.schedule!.afterRunCrm![0].config.mapping.domain = 'domain';
    const write = vi.fn(async () => ({ meta: { changes: 1 } }));
    const bound = vi.fn((..._args: unknown[]) => ({
      first: async () => ({ plan: JSON.stringify(prior) }),
      run: write,
    }));
    const db = { prepare: () => ({ bind: bound }) } as unknown as D1Database;
    const confirm = vi.fn(async () => ({
      ...prior,
      status: 'complete' as const,
    }));
    await runScheduledCrm(
      db,
      f.workspace,
      [f.workspace.rows[0].id],
      options,
      confirm,
    );
    expect(write).toHaveBeenCalledTimes(1);
    const refreshed = JSON.parse(
      bound.mock.calls.find(
        (args) => typeof args[0] === 'string' && args[0].startsWith('{'),
      )![0] as string,
    );
    expect(refreshed).toMatchObject({
      id: prior.id,
      revision: 1,
      status: 'preview',
    });
    expect(refreshed.actions[0].action).toBe('create');
    expect(confirm).toHaveBeenCalledExactlyOnceWith(prior.id);
  });

  it('protects the captured mapping and criteria if the original saved mapping is gone', () => {
    const { workspace } = fixture('complete');
    expect(workspace.crmMappings).toBeUndefined();
    for (const column of ['company', 'domain'])
      expect(findColumnDependencies(workspace, column)).toContainEqual(
        expect.objectContaining({ relationship: 'scheduled CRM write' }),
      );
  });
});
