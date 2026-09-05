# Morning Handoff

## Finished

- Added saved function versions and retained configuration history.
- Added explicit per-copy before/after update and rollback previews.
- Preserved output IDs, names, widths and values across compatible updates.
- Marked rows Review and paused schedules until deliberate rerun/rescheduling.
- Remapped version-history lookups in workbook templates.

## Try It

Open **Recipe functions** in the library table, select a saved function and configured steps, and save its next version. In a consuming table select that library/function/version, choose an existing copy, review inputs/settings and apply. Run afterward to refresh values. Earlier versions support the same rollback flow. Test Worker stopped after checks.

## Checks

- 20 focused function, recipe-template and workbook-template tests passed, including mocked HTTP output preservation.
- Typecheck, lint and production build passed.
- Isolated Worker + D1 passed version persistence, cross-table update/rollback, stable downstream references, retained pre-run values and paused schedule.
- Stale save rejected without overwriting a concurrent edit; home HTTP 200 passed.
- Diff review/whitespace passed. No browser interaction test, real provider call or deployment.

## Decisions

- One previewed copy at a time; local recipe edits are replaced explicitly.
- In-place updates require the same step count and output count/types.
- Structural changes need a new copy; no bulk rollout claim.

## Remaining

- Native provider presets and recurring signals.
- Numeric/grouped aggregations and richer formulas.
- Structural function migration and bulk rollout.
- Governed CRM writeback and portable workbook export.
- Self-host packaging, hosted accounts and public release later.

## Review First

- `lib/recipe-functions.ts` and `lib/recipe-templates.ts` for stable output updates.
- `components/recipe-function-builder.tsx` for version selection and preview.
- `docs/capability-gap.md` for remaining competitor gaps.
