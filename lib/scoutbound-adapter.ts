import type { WorkspaceSnapshot } from './pomade-types';

export type ScoutboundPipeline = {
  tab: string;
  actions: Array<{
    id: string;
    type: 'formula' | 'ai';
    targetColumn: string;
    recipe?: string;
  }>;
};

// Stable seam between Pomade's visual model and Scoutbound's execution model.
// Hosted runs use the safe local engine; a self-hosted worker can submit this
// contract to Scoutbound without granting shell execution to the browser.
export function toScoutboundPipeline(workspace: WorkspaceSnapshot): ScoutboundPipeline {
  return {
    tab: workspace.name,
    actions: workspace.columns
      .filter((column) => column.kind === 'formula' || column.kind === 'enrichment')
      .map((column) => ({
        id: column.id,
        type: column.kind === 'formula' ? 'formula' : 'ai',
        targetColumn: column.id,
        recipe: column.recipe,
      })),
  };
}
