import { conditionFields } from './run-conditions';
import { providerInputFields } from './provider-waterfall';
import { httpInputFields } from './http-enrichment';
import type { PomadeColumn, WorkspaceSnapshot } from './pomade-types';

export type ColumnDependency = {
  ownerId: string;
  ownerTitle: string;
  relationship: string;
};

const builtinInputs: Partial<
  Record<NonNullable<PomadeColumn['recipe']>, string[]>
> = {
  'normalize-domain': ['domain'],
  'first-name': ['person'],
  'email-domain': ['email', 'apollo_email'],
  'dedupe-key': ['email', 'apollo_email', 'person', 'domain'],
  'score-fit': ['company', 'person', 'title', 'domain'],
  'write-opener': ['company', 'person'],
  'company-summary': ['company'],
};

function templateFields(value?: string) {
  return [...(value ?? '').matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].flatMap(
    (match) => {
      const field = match[1]?.split('|')[0]?.trim();
      return field && /^[a-zA-Z0-9_-]+$/.test(field) ? [field] : [];
    },
  );
}

function addDependency(
  dependencies: ColumnDependency[],
  ownerId: string,
  ownerTitle: string,
  relationship: string,
) {
  if (
    !dependencies.some(
      (item) => item.ownerId === ownerId && item.relationship === relationship,
    )
  ) {
    dependencies.push({ ownerId, ownerTitle, relationship });
  }
}

export function findColumnDependencies(
  workspace: WorkspaceSnapshot,
  columnId: string,
): ColumnDependency[] {
  const dependencies: ColumnDependency[] = [];
  for (const column of workspace.columns) {
    if (column.id === columnId) continue;
    const boundInputs = new Set(Object.values(column.inputBindings ?? {}));
    const templateInputs = [
      ...templateFields(column.expression),
      ...(column.http ? httpInputFields(column.http) : []),
      ...(column.providerWaterfall
        ? providerInputFields(column.providerWaterfall)
        : []),
      ...templateFields(column.prompt),
      ...(column.recipe ? (builtinInputs[column.recipe] ?? []) : []),
    ].map((input) => column.inputBindings?.[input] ?? input);
    if (boundInputs.has(columnId) || templateInputs.includes(columnId)) {
      addDependency(dependencies, column.id, column.title, 'recipe input');
    }
    if (conditionFields(column.runCondition).includes(columnId)) {
      addDependency(dependencies, column.id, column.title, 'run condition');
    }
    if (column.waterfallSteps?.some((step) => step.field === columnId)) {
      addDependency(dependencies, column.id, column.title, 'waterfall step');
    }
    if (
      Object.values(column.listDestinationBindings ?? {}).includes(columnId)
    ) {
      addDependency(dependencies, column.id, column.title, 'list destination');
    }
    if (column.lineageColumnId === columnId) {
      addDependency(dependencies, column.id, column.title, 'lineage output');
    }
    if (column.outputFields?.some((field) => field.id === columnId)) {
      addDependency(dependencies, column.id, column.title, 'structured output');
    }
  }
  for (const watch of workspace.signalWatches ?? []) {
    if (watch.columnId === columnId || watch.sourceColumnId === columnId)
      addDependency(dependencies, watch.id, watch.name, 'signal watch');
  }
  for (const view of workspace.savedViews ?? []) {
    if (view.columnId === columnId) {
      addDependency(dependencies, view.id, view.name, 'saved view');
    }
  }
  for (const rule of workspace.tableTransfers ?? [])
    if (
      rule.sourceKey === columnId ||
      conditionFields(rule.condition).includes(columnId) ||
      Object.values(rule.mapping).includes(columnId)
    )
      addDependency(dependencies, rule.id, rule.name, 'table transfer');
  for (const mapping of workspace.crmMappings ?? []) {
    if (
      mapping.config.idColumn === columnId ||
      Object.values(mapping.config.mapping).includes(columnId)
    )
      addDependency(
        dependencies,
        mapping.id,
        mapping.name,
        'saved CRM mapping',
      );
  }
  for (const write of workspace.schedule?.afterRunCrm ?? []) {
    if (
      write.config.idColumn === columnId ||
      Object.values(write.config.mapping).includes(columnId) ||
      conditionFields(write.condition).includes(columnId)
    )
      addDependency(
        dependencies,
        write.mappingId,
        write.name,
        'scheduled CRM write',
      );
  }
  return dependencies;
}

export function deleteWorkspaceColumn(
  workspace: WorkspaceSnapshot,
  columnId: string,
  now = Date.now(),
): WorkspaceSnapshot {
  const column = workspace.columns.find(
    (candidate) => candidate.id === columnId,
  );
  if (!column) throw new Error('The column no longer exists.');
  if (column.kind === 'status') {
    throw new Error('The run-status column is required and cannot be deleted.');
  }
  const dependencies = findColumnDependencies(workspace, columnId);
  if (dependencies.length) {
    const owners = [...new Set(dependencies.map((item) => item.ownerTitle))];
    throw new Error(
      `Remove this column from ${owners.slice(0, 3).join(', ')} first${owners.length > 3 ? ` and ${owners.length - 3} more` : ''}.`,
    );
  }

  const columns = workspace.columns.filter(
    (candidate) => candidate.id !== columnId,
  );
  const hasRecipes = columns.some(
    (candidate) =>
      candidate.kind === 'formula' || candidate.kind === 'enrichment',
  );
  return {
    ...workspace,
    columns,
    rows: workspace.rows.map((row) => {
      const values = { ...row.values };
      delete values[columnId];
      if (row.generatedByColumnId !== columnId) return { ...row, values };
      const {
        generatedByColumnId: _generatedByColumnId,
        generatedAt: _generatedAt,
        parentRowId: _parentRowId,
        ...detached
      } = row;
      return { ...detached, values };
    }),
    schedule:
      workspace.schedule && !hasRecipes
        ? {
            ...workspace.schedule,
            enabled: false,
            state: 'paused',
            leaseUntil: undefined,
            updatedAt: now,
          }
        : workspace.schedule,
    updatedAt: now,
  };
}

export function renameWorkspaceColumn(
  workspace: WorkspaceSnapshot,
  columnId: string,
  title: string,
  now = Date.now(),
): WorkspaceSnapshot {
  const column = workspace.columns.find(
    (candidate) => candidate.id === columnId,
  );
  if (!column) throw new Error('The column no longer exists.');
  const nextTitle = title.replace(/\s+/g, ' ').trim();
  if (!nextTitle || nextTitle.length > 80) {
    throw new Error('Column names require between 1 and 80 characters.');
  }
  if (
    workspace.columns.some(
      (candidate) =>
        candidate.id !== columnId &&
        candidate.title.trim().toLowerCase() === nextTitle.toLowerCase(),
    )
  ) {
    throw new Error('Another column already uses that name.');
  }
  if (column.title === nextTitle) return workspace;
  const priorTitle = column.title;
  return {
    ...workspace,
    columns: workspace.columns.map((candidate) => ({
      ...candidate,
      title: candidate.id === columnId ? nextTitle : candidate.title,
      outputFields: candidate.outputFields?.map((field) =>
        field.id === columnId ? { ...field, title: nextTitle } : field,
      ),
      waterfallSteps: candidate.waterfallSteps?.map((step) =>
        step.field === columnId && step.label === priorTitle
          ? { ...step, label: nextTitle }
          : step,
      ),
    })),
    updatedAt: now,
  };
}
