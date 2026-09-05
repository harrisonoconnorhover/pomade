import { pauseRecipeSchedule } from './recipe-schedule';
import type {
  WorkspaceSnapshot,
  RecipeFunction,
  RecipeTemplate,
  PomadeColumn,
} from './pomade-types';
import {
  createRecipeTemplate,
  instantiateRecipeTemplate,
} from './recipe-templates';
const outputs = (step: RecipeTemplate) =>
  step.column.outputFields?.length
    ? step.column.outputFields.map((f) => f.id)
    : [step.column.id];
export function createRecipeFunction(
  workspace: WorkspaceSnapshot,
  columnIds: string[],
  options: { id: string; name: string },
): RecipeFunction {
  const selected = new Set(columnIds);
  const columns = workspace.columns.filter((c) => selected.has(c.id));
  if (
    columns.length < 2 ||
    columns.length > 10 ||
    columns.length !== selected.size ||
    !options.name.trim()
  )
    throw new Error(
      'Name the function and select two to ten configured recipe columns.',
    );
  if (columns.some((c) => c.outputCardinality === 'list'))
    throw new Error(
      'List-producing recipes need a separate table stage; this function runs steps on the same rows.',
    );
  const steps = columns.map((c, i) =>
    createRecipeTemplate(c, workspace.columns, {
      id: `${options.id}_${i}`,
      name: c.title,
    }),
  );
  const allOutputs = new Set(steps.flatMap(outputs));
  const available = new Set<string>();
  const inputs = new Map<string, RecipeFunction['inputs'][number]>();
  for (const step of steps) {
    for (const input of step.inputs) {
      if (allOutputs.has(input.sourceColumnId)) {
        if (!available.has(input.sourceColumnId))
          throw new Error(
            `${step.name} reads a function output before its producing step. Reorder the source columns first.`,
          );
      } else {
        const existing = inputs.get(input.sourceColumnId);
        inputs.set(input.sourceColumnId, {
          ...input,
          key: input.sourceColumnId,
          required: input.required || Boolean(existing?.required),
        });
      }
    }
    for (const id of outputs(step)) available.add(id);
  }
  return {
    version: 1,
    id: options.id,
    name: options.name.trim(),
    createdAt: Date.now(),
    steps,
    inputs: [...inputs.values()],
  };
}
export function instantiateRecipeFunction(
  definition: RecipeFunction,
  workspace: WorkspaceSnapshot,
  bindings: Record<string, string>,
) {
  const columns = [...workspace.columns],
    added: PomadeColumn[] = [];
  const mapped = new Map<string, string>();
  const instanceId = crypto.randomUUID();
  for (const [index, step] of definition.steps.entries()) {
    if (step.column.lookup?.sourceTableId === workspace.id)
      throw new Error(
        'A lookup in this function points at the destination table. Choose another destination.',
      );
    const stepBindings = Object.fromEntries(
      step.inputs.map((input) => [
        input.key,
        mapped.get(input.sourceColumnId) ??
          bindings[input.sourceColumnId] ??
          '',
      ]),
    );
    const next = instantiateRecipeTemplate(step, columns, stepBindings);
    next[0].functionInstance = {
      id: instanceId,
      definitionId: definition.id,
      version: definition.version ?? 1,
      bindings: { ...bindings },
      name: definition.name,
      step: index,
      total: definition.steps.length,
    };
    outputs(step).forEach((id, i) => mapped.set(id, next[i].id));
    columns.push(...next);
    added.push(...next);
  }
  if (workspace.columns.length + added.length > 100)
    throw new Error('This function would exceed the 100-column table limit.');
  return added;
}
export function functionStepIds(columns: PomadeColumn[], instanceId: string) {
  const steps = columns.filter((c) => c.functionInstance?.id === instanceId);
  if (
    !steps.length ||
    steps.length !== steps[0].functionInstance!.total ||
    steps.some((c, i) => c.functionInstance!.step !== i)
  )
    throw new Error(
      'Function steps were removed or reordered. Restore their order or add the function again.',
    );
  return steps.map((c) => c.id);
}

export function reviseRecipeFunction(
  previous: RecipeFunction,
  workspace: WorkspaceSnapshot,
  columnIds: string[],
) {
  const next = createRecipeFunction(workspace, columnIds, {
    id: previous.id,
    name: previous.name,
  });
  next.version = (previous.version ?? 1) + 1;
  next.history = [
    ...(previous.history ?? []),
    {
      version: previous.version ?? 1,
      createdAt: previous.createdAt,
      steps: structuredClone(previous.steps),
      inputs: structuredClone(previous.inputs),
    },
  ];
  return next;
}
export function planRecipeFunctionUpdate(
  workspace: WorkspaceSnapshot,
  definition: RecipeFunction,
  instanceId: string,
  bindings: Record<string, string>,
) {
  const ids = functionStepIds(workspace.columns, instanceId);
  const steps = ids.map((id) => workspace.columns.find((c) => c.id === id)!);
  if (steps[0].functionInstance!.definitionId !== definition.id)
    throw new Error('Choose an instance of this saved function.');
  if (steps.length !== definition.steps.length)
    throw new Error(
      'Step count changed. Add a new function copy for this version.',
    );
  const existingOutputs = steps.map((c) =>
    c.outputFields?.length ? c.outputFields.map((f) => f.id) : [c.id],
  );
  const owned = new Set(existingOutputs.flat());
  if (Object.values(bindings).some((id) => owned.has(id)))
    throw new Error(
      'External inputs cannot point at this function’s own outputs.',
    );
  const mapped = new Map<string, string>();
  const replacements = new Map<string, PomadeColumn>();
  const changes: {
    title: string;
    before: PomadeColumn;
    after: PomadeColumn;
  }[] = [];
  for (const [i, step] of definition.steps.entries()) {
    if (step.column.outputCardinality === 'list')
      throw new Error('List-producing steps require a separate function copy.');
    if (step.column.lookup?.sourceTableId === workspace.id)
      throw new Error('A lookup cannot point to its own table.');
    const preserved = existingOutputs[i].map((id) =>
      workspace.columns.find((c) => c.id === id),
    );
    if (
      preserved.some((c) => !c) ||
      preserved.slice(1).some((c) => c!.kind !== 'text')
    )
      throw new Error(
        'An output column was removed or converted. Restore it before updating.',
      );
    const stepBindings = Object.fromEntries(
      step.inputs.map((input) => [
        input.key,
        mapped.get(input.sourceColumnId) ??
          bindings[input.sourceColumnId] ??
          '',
      ]),
    );
    const next = instantiateRecipeTemplate(
      step,
      workspace.columns,
      stepBindings,
      preserved as PomadeColumn[],
    );
    next[0].functionInstance = {
      id: instanceId,
      definitionId: definition.id,
      version: definition.version ?? 1,
      name: definition.name,
      step: i,
      total: steps.length,
      bindings: { ...bindings },
    };
    outputs(step).forEach((id, j) => mapped.set(id, next[j].id));
    next.forEach((c) => replacements.set(c.id, c));
    changes.push({ title: steps[i].title, before: steps[i], after: next[0] });
  }
  const updated: WorkspaceSnapshot = {
    ...workspace,
    columns: workspace.columns.map((c) => replacements.get(c.id) ?? c),
    rows: workspace.rows.map((r) => ({
      ...r,
      values: { ...r.values, status: 'Review' },
    })),
    schedule: workspace.schedule
      ? pauseRecipeSchedule(workspace.schedule)
      : undefined,
    updatedAt: Date.now(),
  };
  return { workspace: updated, changes };
}
