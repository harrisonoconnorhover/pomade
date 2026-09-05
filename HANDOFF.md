# Morning Handoff

## Finished

- Added persistent Glide column resizing and safe drag reordering without recipe-order drift.
- Added guarded row deletion with descendant cleanup and captured-schedule pruning.
- Added stable-ID column renaming through native Glide header menus.
- Added immediate and background single-recipe runs from each recipe header menu.
- Added a transparent recent-usage summary for local/provider actions, cache hits, observed credits, and unknown cost.

## Try It

Open **Run history** to see the latest receipt-backed usage summary, then choose any run for its immutable detail. Open a formula or enrichment column's header menu and choose **Run now** or **Queue** to exercise a scoped run.

## Checks

- `npm test`: 90 tests passed across 20 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with `/api/jobs` in the route manifest.
- Isolated Worker + D1 E2E: queued formula row completed with its scoped receipt.

## Decisions

- The summary reads the same latest-ten immutable receipt window; it is not billing.
- Only numeric provider-reported credits are totaled; cache hits and unknown costs stay separate.
- Multi-table discovery remains deferred until an owner-auth boundary can protect table metadata.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add saved-search, Maps, and job-board sources.
- Add authenticated plan import and governed HubSpot/Salesforce writeback.
- Add owner-authenticated multiple related tables and workbook templates.
- Publish the local feature slices after review and fresh approval.

## Review First

- `components/pomade-workspace.tsx` for usage presentation and run-history integration.
- `lib/usage-summary.ts` for receipt classification and totals.
- `lib/usage-summary.test.ts` for observed, cached, unknown-cost, and local coverage.
