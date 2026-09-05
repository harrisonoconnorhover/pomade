# Morning Handoff

## Finished

- Added function-only scope to existing recipe schedules.
- Added optional post-success transfer using a captured saved mapping.
- Kept original scheduled row scope through both stages.
- Committed destination changes, receipt and schedule completion together.
- Stopped failed/broken recipes and ambiguous transfers before destination changes.

## Try It

Configure and preview a transfer in **Transfer rows**. Open **Schedule recipe runs**, choose a function or all recipes, then select the transfer under **After a successful run**. Save a future time. Keep the local Worker and `npm run clock` running for scheduled execution. Test Worker stopped after verification.

## Checks

- 20 focused schedule, function and transfer tests passed.
- Typecheck, lint and production build passed.
- Isolated Worker + D1 passed scoped execution, copied mapping, selected rows, receipts, completed-tick deduplication and repeatable upsert.
- Duplicate-key and broken-function failures left the destination unchanged; home HTTP 200 passed.
- Diff whitespace/review passed. No browser interaction test, real provider calls or deployment.

## Decisions

- Capture transfer settings when saving; later rule edits do not affect active schedules.
- Scheduled match-key review blocks the whole transfer.
- Recipe lease recovery can repeat provider execution; no exactly-once claim.

## Remaining

- Scheduled API-source refresh and branching workflows.
- Workbook templates and versioned function updates.
- Native provider presets, signals and numeric/grouped aggregations.
- Governed CRM writeback and retained-history controls.
- Self-host packaging, hosted accounts and public release later.

## Review First

- `worker.ts` and `db/scheduled-transfer.ts` for ordered execution and atomic completion.
- `lib/recipe-schedule.ts` and schedule UI for captured scope/settings.
- `docs/capability-gap.md` for remaining competitor gaps.
