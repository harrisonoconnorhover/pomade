# Morning Handoff

## Finished

- Added reusable groups of two to ten same-row recipe steps.
- Added cross-table library selection, external input mapping and output preview.
- Automatically remapped intermediate structured outputs and run conditions.
- Added grouped immediate/background execution with existing request controls.
- Preserved independent copies and detected missing/reordered group steps.

## Try It

Run `npm run dev`, open **Recipe functions**, and save two configured recipe columns. In another table choose the source library, map inputs and add the function. Use **Run function** or **Queue function** for selected/visible rows. Background execution needs the existing Worker tick/clock. Test server stopped after verification.

## Checks

- 16 focused function, template and ordered-pipeline tests passed, including mocked HTTP chaining.
- Typecheck, lint and production build passed.
- Isolated Worker + D1 passed definition persistence, cross-table mapping, scoped manual and queued runs, unchanged source and home HTTP 200.
- Final whitespace/diff review passed. No browser interaction test, real provider call or deployment.

## Decisions

- Same-row functions reuse existing execution; list-producing steps remain separate stages.
- Saved definitions and added instances are independent copies.
- Keep builds and commits local; full competitor goal remains active.

## Remaining

- Versioned function updates and portable export.
- Scheduled table workflows and workbook templates.
- Numeric/grouped aggregations, native provider presets and signals.
- Governed CRM writeback and retained-history controls.
- Self-host packaging, hosted accounts and public release later.

## Review First

- `lib/recipe-functions.ts` and tests for dependency mapping and execution scope.
- `components/recipe-function-builder.tsx` for capture, reuse and grouped runs.
- `docs/capability-gap.md` for remaining competitor gaps.
