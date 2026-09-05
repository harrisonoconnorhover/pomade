# Morning Handoff

## Finished

- Added conditional filtering to saved table transfers.
- Added selected-parent generated-child routing and combined row scope.
- Added up to five captured scheduled branches with distinct destinations.
- Committed branch destination changes and receipts together.
- Preserved legacy schedules and remapped branches in workbook templates.

## Try It

Configure conditions and row scope in **Transfer rows**, then preview. For children, select a list recipe and the source parent rows. In **Schedule recipe runs**, select the desired transfer rules after recipe success. Every matching branch receives the row. Test Worker stopped after verification.

## Checks

- 23 focused transfer, schedule and workbook-template tests passed.
- Typecheck, lint and production build passed.
- Isolated Worker + D1 passed post-formula routing to three destinations, selected-parent child routing, previews and branch receipts.
- A failed second branch left every destination and transfer history unchanged; home HTTP 200 passed.
- Diff review/whitespace passed. No browser interaction test, provider call or deployment.

## Decisions

- Conditions run before key matching; excluded rows count as skips.
- Child routing uses current stored children, including earlier-run children.
- Independent fan-out branches commit together; earlier source/recipe stages persist.

## Remaining

- Versioned function rollout and native provider presets.
- Recurring signals and numeric/grouped aggregations.
- Nested workflow graphs and automatic downstream execution.
- Governed CRM writeback and portable workbook export.
- Self-host packaging, hosted accounts and public release later.

## Review First

- `lib/table-transfer.ts` for row scope and conditional matching.
- `db/scheduled-transfer.ts` and schedule UI for multi-destination execution.
- `docs/capability-gap.md` for remaining competitor gaps.
