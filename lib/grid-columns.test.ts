import { describe, expect, it } from 'vitest';

import { moveWorkspaceColumn, resizeWorkspaceColumn } from './grid-columns';
import { createSampleWorkspace } from './sample-workspace';

describe('grid column layout', () => {
  it('persists bounded column widths', () => {
    const workspace = createSampleWorkspace();
    const resized = resizeWorkspaceColumn(workspace, 'company', 247.6);
    const minimum = resizeWorkspaceColumn(resized, 'person', 20);
    const maximum = resizeWorkspaceColumn(minimum, 'title', 900);

    expect(resized.columns[0].width).toBe(248);
    expect(minimum.columns[1].width).toBe(80);
    expect(maximum.columns[2].width).toBe(500);
    expect(workspace.columns[0].width).toBe(170);
  });

  it('reorders ordinary columns without changing recipe execution order', () => {
    const workspace = createSampleWorkspace();
    const moved = moveWorkspaceColumn(workspace, 0, 3);

    expect(moved.columns.slice(0, 4).map((column) => column.id)).toEqual([
      'person',
      'title',
      'domain',
      'company',
    ]);
    expect(
      moved.columns
        .filter(
          (column) => column.kind === 'formula' || column.kind === 'enrichment',
        )
        .map((column) => column.id),
    ).toEqual(['fit', 'opener']);
  });

  it('keeps status anchored and prevents recipe reordering', () => {
    const workspace = createSampleWorkspace();

    expect(() => moveWorkspaceColumn(workspace, 6, 0)).toThrow('anchored');
    expect(() => moveWorkspaceColumn(workspace, 4, 5)).toThrow(
      'execution order',
    );
  });
});
