import { providerInputFields } from './provider-waterfall';
import { httpInputFields } from './http-enrichment';
import type {
  PomadeColumn,
  RecipeTemplate,
  RecipeTemplateInput,
} from './pomade-types';

type RecipeInputSpec = { key: string; required: boolean };

const builtinRecipeInputs: Partial<
  Record<NonNullable<PomadeColumn['recipe']>, RecipeInputSpec[]>
> = {
  'table-lookup': [{ key: 'match', required: true }],
  'normalize-domain': [{ key: 'domain', required: true }],
  'first-name': [{ key: 'person', required: true }],
  'email-domain': [
    { key: 'email', required: false },
    { key: 'apollo_email', required: false },
  ],
  'dedupe-key': [
    { key: 'email', required: false },
    { key: 'apollo_email', required: false },
    { key: 'person', required: false },
    { key: 'domain', required: false },
  ],
  'score-fit': [
    { key: 'company', required: true },
    { key: 'person', required: false },
    { key: 'title', required: true },
    { key: 'domain', required: false },
  ],
  'write-opener': [
    { key: 'company', required: true },
    { key: 'person', required: false },
  ],
  'company-summary': [{ key: 'company', required: true }],
};

function templateFields(value: string | undefined) {
  const fields: string[] = [];
  for (const match of (value ?? '').matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const field = match[1]?.split('|')[0]?.trim();
    if (field && /^[a-zA-Z0-9_-]+$/.test(field) && !fields.includes(field)) {
      fields.push(field);
    }
  }
  return fields;
}

function humanize(value: string) {
  return value
    .replace(/^__/, '')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function recipeInputSpecs(column: PomadeColumn): RecipeInputSpec[] {
  if (column.providerWaterfall)
    return providerInputFields(column.providerWaterfall).map((key) => ({
      key,
      required: true,
    }));
  if (column.recipe === 'http-api' && column.http)
    return httpInputFields(column.http).map((key) => ({ key, required: true }));
  if (column.recipe === 'custom-formula') {
    return templateFields(column.expression).map((key) => ({
      key,
      required: true,
    }));
  }
  if (column.recipe === 'web-research') {
    const promptInputs = templateFields(column.prompt).map((key) => ({
      key,
      required: true,
    }));
    for (const key of ['company', 'domain', 'person', 'title']) {
      if (!promptInputs.some((input) => input.key === key)) {
        promptInputs.push({ key, required: false });
      }
    }
    return promptInputs;
  }
  if (column.recipe === 'waterfall') {
    return (column.waterfallSteps ?? []).map((step) => ({
      key: step.field,
      required: true,
    }));
  }
  return column.recipe ? (builtinRecipeInputs[column.recipe] ?? []) : [];
}

function cloneColumn(column: PomadeColumn): PomadeColumn {
  return {
    ...column,
    functionInstance: undefined,
    providerWaterfall: column.providerWaterfall
      ? structuredClone(column.providerWaterfall)
      : undefined,
    http: column.http ? structuredClone(column.http) : undefined,
    lookup: column.lookup ? structuredClone(column.lookup) : undefined,
    inputBindings: column.inputBindings
      ? { ...column.inputBindings }
      : undefined,
    listDestinationBindings: column.listDestinationBindings
      ? { ...column.listDestinationBindings }
      : undefined,
    outputFields: column.outputFields?.map((field) => ({ ...field })),
    runCondition: column.runCondition ? { ...column.runCondition } : undefined,
    waterfallSteps: column.waterfallSteps?.map((step) => ({ ...step })),
  };
}

export function createRecipeTemplate(
  column: PomadeColumn,
  columns: PomadeColumn[],
  options: {
    id: string;
    name: string;
    description?: string;
    createdAt?: number;
  },
): RecipeTemplate {
  if (!column.recipe || !['formula', 'enrichment'].includes(column.kind)) {
    throw new Error('Only configured recipe columns can become templates.');
  }
  const name = options.name.trim();
  if (!name) throw new Error('Template name is required.');

  const inputs: RecipeTemplateInput[] = recipeInputSpecs(column).map(
    ({ key, required }) => {
      const sourceColumnId = column.inputBindings?.[key] ?? key;
      return {
        key,
        sourceColumnId,
        title:
          columns.find((candidate) => candidate.id === sourceColumnId)?.title ??
          humanize(key),
        required,
        purpose: 'recipe',
      };
    },
  );

  const conditionField = column.runCondition?.field;
  const conditionRecipeInput = inputs.find(
    (input) => input.sourceColumnId === conditionField,
  );
  if (conditionRecipeInput) conditionRecipeInput.required = true;
  if (conditionField && !conditionRecipeInput) {
    inputs.push({
      key: '__condition_field',
      sourceColumnId: conditionField,
      title:
        columns.find((candidate) => candidate.id === conditionField)?.title ??
        humanize(conditionField),
      required: true,
      purpose: 'condition',
    });
  }

  return {
    id: options.id,
    name,
    description: options.description?.trim() ?? '',
    createdAt: options.createdAt ?? Date.now(),
    column: cloneColumn(column),
    inputs,
  };
}

export function defaultTemplateBindings(
  template: RecipeTemplate,
  columns: PomadeColumn[],
) {
  const usable = columns.filter((column) => column.kind !== 'status');
  return Object.fromEntries(
    template.inputs.map((input) => {
      const direct = usable.find(
        (column) => column.id === input.sourceColumnId,
      );
      const byTitle = usable.find(
        (column) =>
          column.title.trim().toLowerCase() ===
          input.title.trim().toLowerCase(),
      );
      return [input.key, direct?.id ?? byTitle?.id ?? ''];
    }),
  );
}

function uniqueId(base: string, used: Set<string>) {
  const safe =
    base
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'column';
  let candidate = safe;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${safe}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

function uniqueTitle(title: string, used: Set<string>) {
  let candidate = title;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${title} ${suffix++}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export function instantiateRecipeTemplate(
  template: RecipeTemplate,
  columns: PomadeColumn[],
  bindings: Record<string, string>,
  preservedOutputs?: PomadeColumn[],
) {
  const usableIds = new Set(
    columns
      .filter((column) => column.kind !== 'status')
      .map((column) => column.id),
  );
  for (const input of template.inputs) {
    const binding = bindings[input.key] ?? '';
    if (input.required && !binding) {
      throw new Error(`${input.title} needs an input column.`);
    }
    if (binding && !usableIds.has(binding)) {
      throw new Error(`${input.title} is mapped to an unavailable column.`);
    }
  }

  const usedIds = new Set(columns.map((column) => column.id));
  const usedTitles = new Set(
    columns.map((column) => column.title.toLowerCase()),
  );
  const sourceOutputs = template.column.outputFields?.length
    ? template.column.outputFields
    : [
        {
          id: template.column.id,
          title: template.column.title,
          valueType: template.column.valueType ?? ('text' as const),
        },
      ];
  const outputFields = sourceOutputs.map((output) => {
    const title = uniqueTitle(output.title, usedTitles);
    return {
      id: uniqueId(title, usedIds),
      title,
      valueType: output.valueType,
    };
  });
  if (preservedOutputs) {
    if (
      preservedOutputs.length !== outputFields.length ||
      preservedOutputs.some(
        (c, i) => (c.valueType ?? 'text') !== outputFields[i].valueType,
      )
    )
      throw new Error(
        'Output count or types changed. Add a new function copy for this version.',
      );
    outputFields.forEach((field, i) => {
      field.id = preservedOutputs[i].id;
      field.title = preservedOutputs[i].title;
    });
  }
  const [primary, ...supporting] = outputFields;
  if (!primary) throw new Error('Template needs an output column.');

  const inputBindings = Object.fromEntries(
    template.inputs
      .filter((input) => input.purpose !== 'condition')
      .map((input) => [input.key, bindings[input.key] ?? '']),
  );
  const conditionInput = template.column.runCondition
    ? template.inputs.find(
        (input) => input.sourceColumnId === template.column.runCondition?.field,
      )
    : undefined;
  const lineageOutputIndex = template.column.lineageColumnId
    ? sourceOutputs.findIndex(
        (output) => output.id === template.column.lineageColumnId,
      )
    : -1;
  const listDestinationBindings = Object.fromEntries(
    Object.entries(template.column.listDestinationBindings ?? {}).flatMap(
      ([sourceOutputId, destinationId]) => {
        const outputIndex = sourceOutputs.findIndex(
          (output) => output.id === sourceOutputId,
        );
        const outputId = outputFields[outputIndex]?.id;
        return outputId && usableIds.has(destinationId)
          ? [[outputId, destinationId]]
          : [];
      },
    ),
  );
  const column: PomadeColumn = {
    ...cloneColumn(template.column),
    id: primary.id,
    providerWaterfall: template.column.providerWaterfall
      ? {
          ...structuredClone(template.column.providerWaterfall),
          winnerColumnId:
            outputFields[
              sourceOutputs.findIndex(
                (f) =>
                  f.id === template.column.providerWaterfall!.winnerColumnId,
              )
            ]?.id ?? '',
          statusColumnId:
            outputFields[
              sourceOutputs.findIndex(
                (f) =>
                  f.id === template.column.providerWaterfall!.statusColumnId,
              )
            ]?.id ?? '',
        }
      : undefined,
    http: template.column.http
      ? {
          ...structuredClone(template.column.http),
          outputs: template.column.http.outputs.map((output) => ({
            ...output,
            outputColumnId:
              outputFields[
                sourceOutputs.findIndex(
                  (field) => field.id === output.outputColumnId,
                )
              ]?.id ?? output.outputColumnId,
          })),
          statusColumnId:
            outputFields[
              sourceOutputs.findIndex(
                (field) => field.id === template.column.http!.statusColumnId,
              )
            ]?.id ?? template.column.http.statusColumnId,
        }
      : undefined,
    lookup: template.column.lookup
      ? {
          ...structuredClone(template.column.lookup),
          outputs: template.column.lookup.outputs.map((output) => ({
            ...output,
            outputColumnId:
              outputFields[
                sourceOutputs.findIndex(
                  (field) => field.id === output.outputColumnId,
                )
              ]?.id ?? output.outputColumnId,
          })),
          statusColumnId:
            outputFields[
              sourceOutputs.findIndex(
                (field) => field.id === template.column.lookup!.statusColumnId,
              )
            ]?.id ?? template.column.lookup.statusColumnId,
        }
      : undefined,
    width: preservedOutputs?.[0].width ?? template.column.width,
    title: primary.title,
    valueType: primary.valueType,
    inputBindings:
      Object.keys(inputBindings).length > 0 ? inputBindings : undefined,
    lineageColumnId:
      lineageOutputIndex >= 0
        ? outputFields[lineageOutputIndex]?.id
        : undefined,
    listDestinationBindings: Object.keys(listDestinationBindings).length
      ? listDestinationBindings
      : undefined,
    outputFields: template.column.outputFields ? outputFields : undefined,
    waterfallSteps: template.column.waterfallSteps?.map((step) => ({
      ...step,
      label:
        columns.find((candidate) => candidate.id === bindings[step.field])
          ?.title ?? step.label,
    })),
    runCondition: template.column.runCondition
      ? {
          ...template.column.runCondition,
          field: conditionInput
            ? bindings[conditionInput.key]
            : template.column.runCondition.field,
        }
      : undefined,
  };

  return [
    column,
    ...supporting.map<PomadeColumn>((field, index) => ({
      ...field,
      kind: 'text',
      width:
        preservedOutputs?.[index + 1].width ??
        (field.valueType === 'text' ? 280 : 160),
    })),
  ];
}
