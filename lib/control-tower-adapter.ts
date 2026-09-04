import type { WorkspaceSnapshot } from './pomade-types';

export type ControlTowerPreviewPlan = {
  source: 'pomade';
  workspaceId: string;
  mode: 'preview';
  records: Array<{
    rowId: string;
    externalKey: string;
    proposedFields: Record<string, string>;
  }>;
  guards: {
    maxRecords: 100;
    allowCreate: false;
  };
};

// Pomade can propose data, but it never executes CRM writes itself. The plan
// must be previewed and approved inside GTM Control Tower before any provider
// connector is called.
export function toControlTowerPreview(
  workspace: WorkspaceSnapshot,
  selectedRowIds = workspace.rows.map((row) => row.id),
): ControlTowerPreviewPlan {
  const selected = new Set(selectedRowIds);
  return {
    source: 'pomade',
    workspaceId: workspace.id,
    mode: 'preview',
    records: workspace.rows
      .filter((row) => selected.has(row.id))
      .slice(0, 100)
      .map((row) => ({
        rowId: row.id,
        externalKey: row.values.domain || row.id,
        proposedFields: Object.fromEntries(
          workspace.columns
            .filter((column) => column.kind !== 'status')
            .map((column) => [column.id, row.values[column.id] ?? '']),
        ),
      })),
    guards: {
      maxRecords: 100,
      allowCreate: false,
    },
  };
}
