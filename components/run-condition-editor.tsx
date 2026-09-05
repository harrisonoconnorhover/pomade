'use client';
import { Button } from '@/components/ui/button';
import {
  conditionNeedsValue,
  conditionOperators,
  conditionRules,
} from '@/lib/run-conditions';
import type {
  PomadeColumn,
  RecipeConditionRule,
  RecipeRunCondition,
  RunConditionOperator,
} from '@/lib/pomade-types';

export default function RunConditionEditor({
  columns,
  condition,
  onChange,
  disabled = false,
  label = 'Run only when',
}: {
  columns: Pick<PomadeColumn, 'id' | 'title'>[];
  condition?: RecipeRunCondition;
  onChange: (condition: RecipeRunCondition | undefined) => void;
  disabled?: boolean;
  label?: string;
}) {
  const rules = conditionRules(condition);
  const mode = condition && 'rules' in condition ? condition.mode : 'all';
  function change(next: RecipeConditionRule[]) {
    onChange(
      !next.length
        ? undefined
        : next.length === 1
          ? next[0]
          : { mode, rules: next },
    );
  }
  return (
    <section className="condition-rule-list" aria-label={label}>
      <div className="condition-builder">
        <strong>{label}</strong>
        {rules.length > 1 ? (
          <select
            aria-label="Combine conditions"
            disabled={disabled}
            value={mode}
            onChange={(e) =>
              onChange({ mode: e.target.value as 'all' | 'any', rules })
            }
          >
            <option value="all">All rules (AND)</option>
            <option value="any">Any rule (OR)</option>
          </select>
        ) : (
          <span>{rules.length ? 'One rule' : 'Always run'}</span>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || rules.length >= 8 || !columns.length}
          onClick={() =>
            change([
              ...rules,
              { field: columns[0].id, operator: 'is_not_empty' },
            ])
          }
        >
          Add rule
        </Button>
      </div>
      {rules.map((rule, index) => (
        <div className="condition-builder" key={index}>
          <select
            aria-label={`${label}: field ${index + 1}`}
            value={rule.field}
            disabled={disabled}
            onChange={(e) =>
              change(
                rules.map((r, i) =>
                  i === index ? { ...r, field: e.target.value } : r,
                ),
              )
            }
          >
            {!columns.some((c) => c.id === rule.field) ? (
              <option value={rule.field}>Missing column: {rule.field}</option>
            ) : null}
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <select
            aria-label={`${label}: operator ${index + 1}`}
            value={rule.operator}
            disabled={disabled}
            onChange={(e) => {
              const operator = e.target.value as RunConditionOperator;
              change(
                rules.map((r, i) =>
                  i === index
                    ? {
                        ...r,
                        operator,
                        value: conditionNeedsValue(operator)
                          ? r.value
                          : undefined,
                      }
                    : r,
                ),
              );
            }}
          >
            {conditionOperators.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
          {conditionNeedsValue(rule.operator) ? (
            <input
              aria-label={`${label}: value ${index + 1}`}
              value={rule.value ?? ''}
              disabled={disabled}
              placeholder="Value"
              onChange={(e) =>
                change(
                  rules.map((r, i) =>
                    i === index ? { ...r, value: e.target.value } : r,
                  ),
                )
              }
            />
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            aria-label={`Remove rule ${index + 1}`}
            onClick={() => change(rules.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      {rules.some((r) =>
        [
          'greater_than',
          'greater_than_or_equal',
          'less_than',
          'less_than_or_equal',
        ].includes(r.operator),
      ) ? (
        <p>
          Numeric rules require plain numbers. Blank values and ranges do not
          qualify.
        </p>
      ) : null}
    </section>
  );
}
