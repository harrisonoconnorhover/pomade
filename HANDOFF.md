# Morning Handoff

## Finished

- Added durable background jobs with progress, workspace locking, pause/resume, and retry.
- Added explicit HubSpot/Salesforce field mapping for preview-only Control Tower handoffs.
- Added persistent named filtered views with live counts and sidebar switching.
- Added persistent Glide column resizing and safe drag reordering without recipe-order drift.
- Added guarded row deletion with descendant cleanup and captured-schedule pruning.

## Try It

Select one or more rows and choose **Action → Delete**. Pomade previews generated-child impact, asks for confirmation, removes descendants, and pauses a captured schedule if its scope becomes empty.

## Checks

- `npm test`: 84 tests passed across 17 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with `/api/jobs` in the route manifest.
- Isolated Worker + D1 E2E: queued formula row completed with its scoped receipt.

## Decisions

- Source-row deletion recursively removes generated descendants.
- Selected-row schedules are pruned and pause when their last target disappears.
- Multi-table discovery remains deferred until an owner-auth boundary can protect table metadata.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add saved-search, Maps, and job-board sources.
- Add authenticated plan import and governed HubSpot/Salesforce writeback.
- Add owner-authenticated multiple related tables and workbook templates.
- Publish the local feature slices after review and fresh approval.

## Review First

- `lib/row-management.ts` for deletion, lineage, and schedule handling.
- `components/pomade-workspace.tsx` for confirmation and selected-row UX.
- `lib/row-management.test.ts` for cascade and schedule coverage.
