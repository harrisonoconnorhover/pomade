# Morning Handoff

## Finished

- Added saved API refresh configurations from complete mapped fetches.
- Added scheduled fetch before existing recipes and optional table transfer.
- Updated stable-ID rows while preserving unmapped fields and absent records.
- Retained failed/partial batches and stopped before input changes.
- Supported empty source results and zero-action runs on empty tables.

## Try It

In **Import from API**, fetch a complete batch with stable IDs, map fields and save its refresh configuration. Enable it in **Schedule recipe runs**, approve the source request bound and choose recipe/transfer scope. Keep the local Worker and `npm run clock` running. Test Worker and fixture stopped after checks.

## Checks

- 22 focused API-source, schedule and pipeline tests passed.
- Typecheck, lint and production build passed.
- Isolated Worker + D1 with a local fake API passed pagination, stable-ID update, formula execution, transfer and unmapped-field preservation.
- Later-page failure retained its batch and left table data unchanged; empty-source zero-action completion and home HTTP 200 passed.
- Diff review/whitespace passed. No browser interaction test, real provider calls or deployment.

## Decisions

- Successful source input changes persist before downstream recipes.
- Partial/limited fetches stop; absent records are never deleted.
- Refresh schedules use all table rows; provider execution is not exactly-once.

## Remaining

- Workbook templates and branching/generated-row routing.
- Versioned function updates and native provider presets.
- Signals and numeric/grouped aggregations.
- Governed CRM writeback and retained-history controls.
- Self-host packaging, hosted accounts and public release later.

## Review First

- `lib/api-source.ts` for mapped update semantics.
- `worker.ts` and schedule UI for source-to-recipe ordering and limits.
- `docs/capability-gap.md` for remaining competitor gaps.
