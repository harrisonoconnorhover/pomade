import type { PomadeColumn, PomadeRow } from './pomade-types';
export function isExternalRecipe(column: PomadeColumn) {
  return (
    column.recipe === 'web-research' ||
    column.recipe === 'http-api' ||
    column.recipe === 'http-waterfall'
  );
}
// Counts provider submissions; asynchronous result checks are reported separately.
// Conditions may change after an earlier provider result. Consent covers the maximum, not stale row values.
export function countMaximumExternalActions(
  rows: PomadeRow[],
  columns: PomadeColumn[],
) {
  return rows.reduce(
    (total, row) =>
      total +
      columns
        .filter(
          (column) =>
            isExternalRecipe(column) &&
            !(
              column.recipe === 'web-research' &&
              column.outputCardinality === 'list' &&
              row.generatedByColumnId === column.id
            ),
        )
        .reduce(
          (sum, column) =>
            sum +
            (column.recipe === 'http-waterfall'
              ? (column.providerWaterfall?.steps.reduce(
                  (count, step) => count + 1 + (step.verifier ? 1 : 0),
                  0,
                ) ?? 4)
              : 1),
          0,
        ),
    0,
  );
}
