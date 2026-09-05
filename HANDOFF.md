# Morning Handoff

## Finished

- Added saved table transfer rules with mapped add-only, update-only and add/update modes.
- Added exact/text/domain matching, optional blank clearing and duplicate/missing-key review.
- Added selected/all-row previews, revision-checked application and persistent receipts.
- Preserved unmapped destination fields, refreshed local formulas and linked changed rows to their source.
- Paused destination schedules and blocked transfers into tables with active background work.

## Try It

Run `npm run dev`, wait for the source table to save, then choose **Transfer to table**. Select a destination and keys, map fields and save the rule. Preview all or selected rows and apply. Saved rules can be rerun; unchanged data is skipped. Preview changes after either table changes. Test server stopped after verification.

## Checks

- 35 focused transfer, formula, column and workbook tests passed.
- Typecheck, lint and production build passed.
- Isolated Worker + D1 passed saved rules, read-only preview, add/update, duplicate review, blank/unmapped preservation, formula refresh and schedule pausing.
- Source/target preview conflicts, repeat no-op, selected reruns, receipt persistence, active-job exclusion and home HTTP 200 passed.
- Diff whitespace check passed. No browser interaction test, provider calls or public deployment.

## Decisions

- Update mapped input fields only; never choose arbitrarily among duplicate keys.
- Apply the previewed table revisions; leave the source untouched.
- Saved rules remain manual reruns. Keep all iteration local and the competitor goal active.

## Remaining

- Contains/multiple-result lookups and richer relationships.
- Scheduled table synchronization and reusable multi-step/workbook templates.
- Native provider presets, signals and scheduled sources.
- Governed CRM writeback and retained-history controls.
- Independent self-host packaging, accounts, Google sign-in and public release later.

## Review First

- `lib/table-transfer.ts` and tests for matching and mutation rules.
- `app/api/transfers/route.ts` for preview revisions, atomic writes and receipts.
- `components/table-transfer-builder.tsx` for saved mappings and preview/application.
