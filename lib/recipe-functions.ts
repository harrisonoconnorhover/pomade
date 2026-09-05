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
