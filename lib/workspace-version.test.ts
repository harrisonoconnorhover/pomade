import { describe, expect, it } from 'vitest';

import { createSampleWorkspace } from './sample-workspace';
import {
  prepareRestoredWorkspace,
  summarizeWorkspaceVersion,
  workspaceContentMatches,
} from './workspace-version';

describe('workspace version helpers', () => {
  it('ignores the persistence timestamp when comparing workspace content', () => {
    const first = createSampleWorkspace();
    const second = { ...first, updatedAt: first.updatedAt + 1_000 };

    expect(workspaceContentMatches(first, second)).toBe(true);
    expect(
      workspaceContentMatches(first, {
        ...second,
        rows: second.rows.slice(0, -1),
      }),
    ).toBe(false);
  });

  it('pauses a restored schedule and clears a stale lease', () => {
    const workspace = createSampleWorkspace();
    workspace.schedule = {
      id: 'schedule-1',
      cadence: 'every_day',
      enabled: true,
      target: 'all',
      confirmExternalResearch: true,
      state: 'running',
      createdAt: 1,
      updatedAt: 2,
      leaseUntil: 10_000,
    };

    const restored = prepareRestoredWorkspace(workspace, 5_000);

    expect(restored.schedule).toMatchObject({
      enabled: false,
      state: 'paused',
      updatedAt: 5_000,
    });
    expect(restored.schedule?.leaseUntil).toBeUndefined();
    expect(restored.updatedAt).toBe(5_000);
  });

  it('summarizes a snapshot without exposing row contents', () => {
    const workspace = createSampleWorkspace();

    expect(
      summarizeWorkspaceVersion('version-1', 'Grid edit', 123, workspace),
    ).toEqual({
      id: 'version-1',
      reason: 'Grid edit',
      createdAt: 123,
      rowCount: 10,
      columnCount: 7,
      sourceLabel: 'Pomade sample data',
    });
  });
});
