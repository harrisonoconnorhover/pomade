import { countMaximumExternalActions } from './external-recipes';
import type { PomadeColumn, PomadeRow } from './pomade-types';
import {
  MAX_BACKGROUND_RESEARCH_ACTIONS,
  MAX_BACKGROUND_ROWS,
} from './run-job';
export const MAX_IMMEDIATE_PROVIDER_SUBMISSIONS = 10;
export const MAX_PROVIDER_SUBMISSIONS_PER_ROW = 10;

export function runBudget(rows: PomadeRow[], columns: PomadeColumn[]) {
  const byRow = rows.map((row) => ({
    rowId: row.id,
    label: row.values.person || row.values.company || row.id,
    maximum: countMaximumExternalActions([row], columns),
  }));
  const total = byRow.reduce((sum, row) => sum + row.maximum, 0);
  const oversized = byRow.find(
    (row) => row.maximum > MAX_PROVIDER_SUBMISSIONS_PER_ROW,
  );
  const empty = !rows.length
    ? 'Select at least one row.'
    : !columns.length
      ? 'Select at least one recipe column.'
      : '';
  const immediateIssue =
    empty ||
    (total > MAX_IMMEDIATE_PROVIDER_SUBMISSIONS
      ? `Up to ${total} provider submissions. Run now allows ${MAX_IMMEDIATE_PROVIDER_SUBMISSIONS}; choose fewer columns or use background.`
      : '');
  const backgroundIssue =
    empty ||
    (rows.length > MAX_BACKGROUND_ROWS
      ? `Background runs support up to ${MAX_BACKGROUND_ROWS} rows. Select fewer rows.`
      : oversized
        ? `${oversized.label} could use ${oversized.maximum} provider submissions. Each row allows ${MAX_PROVIDER_SUBMISSIONS_PER_ROW}; choose fewer columns or waterfall steps.`
        : total > MAX_BACKGROUND_RESEARCH_ACTIONS
          ? `Up to ${total} provider submissions. Background allows ${MAX_BACKGROUND_RESEARCH_ACTIONS}; choose fewer rows or columns.`
          : '');
  return {
    total,
    byRow,
    immediateIssue,
    backgroundIssue,
    immediateAllowed: !immediateIssue,
    backgroundAllowed: !backgroundIssue,
  };
}
