import type { PomadeColumn, PomadeRow } from './pomade-types';
export function isExternalRecipe(column: PomadeColumn) {
  return column.recipe === 'web-research' || column.recipe === 'http-api';
}
// Conditions may change after an earlier provider result. Consent covers the maximum, not stale row values.
export function countMaximumExternalActions(
  rows: PomadeRow[],
  columns: PomadeColumn[],
) {
  return rows.reduce(
    (total, row) =>
      total +
      columns.filter(
        (column) =>
          isExternalRecipe(column) &&
          !(
            column.recipe === 'web-research' &&
            column.outputCardinality === 'list' &&
            row.generatedByColumnId === column.id
          ),
      ).length,
    0,
  );
}
