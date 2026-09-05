# Morning Handoff

## Finished

- Added persistent named filtered views with live counts and sidebar switching.
- Added persistent Glide column resizing and safe drag reordering without recipe-order drift.
- Added guarded row deletion with descendant cleanup and captured-schedule pruning.
- Added stable-ID column renaming through native Glide header menus.
- Added immediate and background single-recipe runs from each recipe header menu.

## Try It

Open a formula or enrichment column's header menu and choose **Run now** or **Queue**. Only that recipe runs for selected rows—or visible rows when none are selected—with the normal provider confirmation and receipts.

## Checks

- `npm test`: 88 tests passed across 19 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with `/api/jobs` in the route manifest.
- Isolated Worker + D1 E2E: queued formula row completed with its scoped receipt.

## Decisions

- Column-scoped execution sends the existing stable recipe ID to the guarded runner.
- Immediate and queued paths retain provider confirmation, limits, and receipts.
- Multi-table discovery remains deferred until an owner-auth boundary can protect table metadata.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add saved-search, Maps, and job-board sources.
- Add authenticated plan import and governed HubSpot/Salesforce writeback.
- Add owner-authenticated multiple related tables and workbook templates.
- Publish the local feature slices after review and fresh approval.

## Review First

- `components/pomade-workspace.tsx` for header-scoped run and queue actions.
- `app/api/runs/route.ts` for guarded column scoping.
- `lib/column-run-scope.test.ts` for single-recipe and row-scope coverage.
