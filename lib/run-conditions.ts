import type {
  PomadeRow,
  RecipeConditionRule,
  RecipeRunCondition,
  RunConditionOperator,
} from './pomade-types';

export const conditionOperators: {
  value: RunConditionOperator;
  label: string;
  needsValue: boolean;
}[] = [
  { value: 'is_not_empty', label: 'is not empty', needsValue: false },
  { value: 'is_empty', label: 'is empty', needsValue: false },
  { value: 'equals', label: 'equals', needsValue: true },
  { value: 'not_equals', label: 'does not equal', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'not_contains', label: 'does not contain', needsValue: true },
  { value: 'greater_than', label: 'is greater than', needsValue: true },
  { value: 'greater_than_or_equal', label: 'is at least', needsValue: true },
  { value: 'less_than', label: 'is less than', needsValue: true },
  { value: 'less_than_or_equal', label: 'is at most', needsValue: true },
];
export const conditionNeedsValue = (operator: RunConditionOperator) =>
  conditionOperators.find((o) => o.value === operator)?.needsValue;
export function conditionRules(
  condition?: RecipeRunCondition,
): RecipeConditionRule[] {
  return !condition ? [] : 'rules' in condition ? condition.rules : [condition];
}
export const conditionFields = (condition?: RecipeRunCondition) => [
  ...new Set(conditionRules(condition).map((r) => r.field)),
];
export function mapConditionFields(
  condition: RecipeRunCondition | undefined,
  map: (field: string) => string,
): RecipeRunCondition | undefined {
  if (!condition) return undefined;
  const rules = conditionRules(condition).map((r) => ({
    ...r,
    field: map(r.field),
  }));
  return 'rules' in condition ? { mode: condition.mode, rules } : rules[0];
}
function numeric(value: string) {
  // Blank, currency, ranges and partially numeric text do not establish qualification.
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
    return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
function matchesRule(condition: RecipeConditionRule, row: PomadeRow) {
  const actual = (row.values[condition.field] ?? '').trim();
  const expected = (condition.value ?? '').trim();
  const a = actual.toLocaleLowerCase(),
    b = expected.toLocaleLowerCase();
  switch (condition.operator) {
    case 'is_not_empty':
      return !!actual;
    case 'is_empty':
      return !actual;
    case 'equals':
      return a === b;
    case 'not_equals':
      return a !== b;
    case 'contains':
      return a.includes(b);
    case 'not_contains':
      return !a.includes(b);
    case 'greater_than':
    case 'greater_than_or_equal':
    case 'less_than':
    case 'less_than_or_equal': {
      const left = numeric(actual),
        right = numeric(expected);
      if (left === undefined || right === undefined) return false;
      if (condition.operator === 'greater_than') return left > right;
      if (condition.operator === 'greater_than_or_equal') return left >= right;
      if (condition.operator === 'less_than') return left < right;
      return left <= right;
    }
    default:
      return false;
  }
}
export function validRunCondition(
  condition: RecipeRunCondition,
  fields?: Set<string>,
) {
  if (
    'rules' in condition &&
    (!['all', 'any'].includes(condition.mode) ||
      !Array.isArray(condition.rules))
  )
    return false;
  const rules = conditionRules(condition);
  return (
    rules.length >= 1 &&
    rules.length <= 8 &&
    rules.every(
      (r) =>
        r &&
        typeof r.field === 'string' &&
        (!fields || fields.has(r.field)) &&
        conditionOperators.some((o) => o.value === r.operator) &&
        (r.value === undefined || typeof r.value === 'string'),
    )
  );
}
export function matchesRunCondition(
  condition: RecipeRunCondition | undefined,
  row: PomadeRow,
): boolean {
  if (!condition) return true;
  if (!validRunCondition(condition)) return false;
  const rules = conditionRules(condition);
  return 'rules' in condition && condition.mode === 'any'
    ? rules.some((r) => matchesRule(r, row))
    : rules.every((r) => matchesRule(r, row));
}
