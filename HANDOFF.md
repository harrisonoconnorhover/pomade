# Morning Handoff

## Finished

- Added explicit HubSpot/Salesforce field mapping for preview-only Control Tower handoffs.
- Added persistent named filtered views with live counts and sidebar switching.
- Added persistent Glide column resizing and safe drag reordering without recipe-order drift.
- Added guarded row deletion with descendant cleanup and captured-schedule pruning.
- Added stable-ID column renaming through native Glide header menus.

## Try It

Open any grid header menu, rename the column, and save. The header changes while its stable ID—and therefore values, views, mappings, structured outputs, and waterfall dependencies—stays intact.

## Checks

- `npm test`: 87 tests passed across 18 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with `/api/jobs` in the route manifest.
- Isolated Worker + D1 E2E: queued formula row completed with its scoped receipt.

## Decisions

- Column display names change without mutating stable data and recipe IDs.
- Structured-output titles and only default waterfall labels follow a rename.
- Multi-table discovery remains deferred until an owner-auth boundary can protect table metadata.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add saved-search, Maps, and job-board sources.
- Add authenticated plan import and governed HubSpot/Salesforce writeback.
- Add owner-authenticated multiple related tables and workbook templates.
- Publish the local feature slices after review and fresh approval.

## Review First

- `lib/column-management.ts` for stable-ID rename propagation.
- `components/pomade-data-grid.tsx` for native Glide header-menu wiring.
- `lib/column-management.test.ts` for output and waterfall coverage.
