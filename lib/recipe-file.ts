import { validateCodexSettings } from './codex-models.mjs';
import { conditionOperators, mapConditionFields } from './run-conditions';
import type { PomadeColumn, RecipeTemplate } from './pomade-types';
import { createRecipeTemplate } from './recipe-templates';

export const MAX_RECIPE_FILE_BYTES = 256_000;
const recipes = [
  'custom-formula',
  'normalize-domain',
  'first-name',
  'email-domain',
  'dedupe-key',
  'score-fit',
  'waterfall',
  'write-opener',
  'company-summary',
  'web-research',
];
const valueTypes = ['text', 'number', 'boolean', 'date'];
const operators = conditionOperators.map((o) => o.value);

type Check = (value: unknown) => boolean;
const string: Check = (v) => typeof v === 'string' && v.length <= 20_000;
const label: Check = (v) => string(v) && (v as string).trim().length > 0;
const id: Check = (v) =>
  typeof v === 'string' &&
  /^[a-zA-Z0-9_-]{1,200}$/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v);
const oneOf =
  (values: string[]): Check =>
  (v) =>
    typeof v === 'string' && values.includes(v);
const optional =
  (check: Check): Check =>
  (v) =>
    v === undefined || check(v);
const object =
  (fields: Record<string, Check>): Check =>
  (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const record = v as Record<string, unknown>;
    return (
      Object.keys(record).every((key) => Object.hasOwn(fields, key)) &&
      Object.entries(fields).every(([key, check]) => check(record[key]))
    );
  };
const array =
  (check: Check, min: number, max: number): Check =>
  (v) =>
    Array.isArray(v) && v.length >= min && v.length <= max && v.every(check);
const bindings: Check = (v) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.entries(v).every(
    ([key, value]) => id(key) && (value === '' || id(value)),
  );
const output = object({ id, title: label, valueType: oneOf(valueTypes) });
const conditionRule = object({
  field: id,
  operator: oneOf(operators),
  value: optional(string),
});
const conditionCheck: Check = (v) =>
  conditionRule(v) ||
  object({ mode: oneOf(['all', 'any']), rules: array(conditionRule, 1, 8) })(v);
const columnCheck = object({
  id,
  title: label,
  kind: oneOf(['formula', 'enrichment']),
  width: (v) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 80 && v <= 500,
  recipe: oneOf(recipes),
  autoRun: optional((v) => typeof v === 'boolean'),
  expression: optional(string),
  prompt: optional(string),
  codexResearch: optional((value) => {
    try {
      validateCodexSettings(value);
      return true;
    } catch {
      return false;
    }
  }),
  inputBindings: optional(bindings),
  lineageColumnId: optional(id),
  valueType: optional(oneOf(valueTypes)),
  outputCardinality: optional(oneOf(['record', 'list'])),
  listLimit: optional(
    (v) => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 25,
  ),
  outputFields: optional(array(output, 1, 6)),
  runCondition: optional(conditionCheck),
  waterfallSteps: optional(array(object({ field: id, label }), 2, 6)),
});
const fileCheck = object({
  format: (v) => v === 'pomade-recipe',
  version: (v) => v === 1,
  name: label,
  description: string,
  column: columnCheck,
  inputColumns: array(object({ id, title: label }), 0, 100),
});

function validateColumn(column: PomadeColumn) {
  if (column.recipe === 'custom-formula' && !column.expression?.trim())
    throw new Error('The formula is empty.');
  if (column.recipe === 'web-research' && !column.prompt?.trim())
    throw new Error('The research prompt is empty.');
  if (column.recipe === 'waterfall' && !column.waterfallSteps?.length)
    throw new Error('The waterfall needs ordered sources.');
  const outputs = column.outputFields;
  if (
    outputs &&
    (outputs[0].id !== column.id ||
      new Set(outputs.map((field) => field.id)).size !== outputs.length)
  )
    throw new Error(
      'Recipe output IDs must be unique and start with the recipe column.',
    );
  if (
    column.lineageColumnId &&
    !outputs?.some((field) => field.id === column.lineageColumnId)
  )
    throw new Error('The lineage output is missing.');
}

// Deliberate allowlist: no rows, account credentials, run state, or destination-table writes.
export function exportRecipeFile(template: RecipeTemplate): string {
  if (
    template.column.recipe === 'http-api' ||
    template.column.recipe === 'http-waterfall'
  )
    throw new Error(
      'HTTP recipes reference a server connection. Use them from the recipe library here; portable HTTP files are not supported yet.',
    );
  if (template.column.recipe === 'table-lookup')
    throw new Error(
      'Lookup recipes reference a table in this workbook. Use them from the recipe library here; portable lookup files are not supported yet.',
    );
  const c = template.column;
  const column: PomadeColumn = {
    id: c.id,
    title: c.title,
    kind: c.kind,
    width: c.width,
    recipe: c.recipe,
    autoRun: c.autoRun,
    expression: c.expression,
    prompt: c.prompt,
    codexResearch: c.codexResearch
      ? validateCodexSettings(c.codexResearch)
      : undefined,
    inputBindings: c.inputBindings,
    lineageColumnId: c.lineageColumnId,
    valueType: c.valueType,
    outputCardinality: c.outputCardinality,
    listLimit: c.listLimit,
    outputFields: c.outputFields?.map(({ id, title, valueType }) => ({
      id,
      title,
      valueType,
    })),
    runCondition: mapConditionFields(c.runCondition, (field) => field),
    waterfallSteps: c.waterfallSteps?.map(({ field, label }) => ({
      field,
      label,
    })),
  };
  const inputColumns = [
    ...new Map(
      template.inputs
        .filter((input) => input.sourceColumnId)
        .map((input) => [
          input.sourceColumnId,
          { id: input.sourceColumnId, title: input.title },
        ]),
    ).values(),
  ];
  const result = JSON.stringify(
    {
      format: 'pomade-recipe',
      version: 1,
      name: template.name,
      description: template.description,
      column,
      inputColumns,
    },
    null,
    2,
  );
  // Ensure files we offer to download can also be read by this version.
  importRecipeFile(result, 'export-check');
  return result;
}

export function importRecipeFile(
  text: string,
  templateId: string,
  now = Date.now(),
): RecipeTemplate {
  if (new TextEncoder().encode(text).byteLength > MAX_RECIPE_FILE_BYTES)
    throw new Error('Recipe files must be smaller than 256 KB.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Choose a valid Pomade recipe JSON file.');
  }
  if (!fileCheck(value))
    throw new Error(
      'Unsupported or invalid Pomade recipe file (expected version 1).',
    );
  const file = value as {
    name: string;
    description: string;
    column: PomadeColumn;
    inputColumns: { id: string; title: string }[];
  };
  validateColumn(file.column);
  if (
    new Set(file.inputColumns.map((c) => c.id)).size !==
    file.inputColumns.length
  )
    throw new Error('Input column IDs must be unique.');
  // Re-derive required inputs from the recipe, never trust a file to relax them.
  return createRecipeTemplate(
    file.column,
    file.inputColumns.map((c) => ({ ...c, kind: 'text', width: 160 })),
    {
      id: templateId,
      name: file.name,
      description: file.description,
      createdAt: now,
    },
  );
}
