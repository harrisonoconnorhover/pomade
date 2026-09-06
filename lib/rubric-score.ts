import type { PomadeColumn, PomadeRow } from './pomade-types';
export type RubricScore = {
  inputs: { field: string; maxPoints: number; minimumPoints?: number }[];
  highAt: number;
  mediumAt: number;
  tierColumnId: string;
  reasonColumnId: string;
};
export function rubricScoreValues(column: PomadeColumn, row: PomadeRow) {
  const rubric = column.rubricScore!;
  const review = (reason: string) => ({
    [column.id]: '',
    [rubric.tierColumnId]: 'Review',
    [rubric.reasonColumnId]: reason,
  });
  if (
    !rubric?.inputs.length ||
    rubric.inputs.reduce((n, i) => n + i.maxPoints, 0) !== 100
  )
    return rubric
      ? review('The rubric must total 100 points.')
      : { [column.id]: '' };
  let total = 0;
  for (const input of rubric.inputs) {
    const text = (row.values[input.field] ?? '').trim();
    const points = text ? Number(text) : NaN;
    if (!Number.isInteger(points) || points < 0 || points > input.maxPoints)
      return review(
        `Review ${input.field}: expected 0–${input.maxPoints} points with evidence.`,
      );
    if (points < (input.minimumPoints ?? 0))
      return review(
        `Qualification gate not met: ${input.field} needs ${input.minimumPoints} points.`,
      );
    total += points;
  }
  return {
    [column.id]: String(total),
    [rubric.tierColumnId]:
      total >= rubric.highAt
        ? 'High'
        : total >= rubric.mediumAt
          ? 'Medium'
          : 'Low',
    [rubric.reasonColumnId]: '',
  };
}
