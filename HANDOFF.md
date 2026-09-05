# Morning Handoff

## Finished

- Added bounded Apollo enrichment for up to ten selected people with partial-success receipts.
- Added durable background jobs with progress, workspace locking, pause/resume, and retry.
- Added explicit HubSpot/Salesforce field mapping for preview-only Control Tower handoffs.
- Added persistent named filtered views with live counts and sidebar switching.
- Added persistent Glide column resizing and safe drag reordering without recipe-order drift.

## Try It

Resize a grid header or drag an ordinary column to a new position, then reload. Pomade preserves the layout while keeping recipe execution order and the final status column fixed.

## Checks

- `npm test`: 81 tests passed across 16 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with `/api/jobs` in the route manifest.
- Isolated Worker + D1 E2E: queued formula row completed with its scoped receipt.

## Decisions

- Glide's native resize and move events persist directly in the workspace snapshot.
- Recipe columns keep their relative execution order even when the visual layout changes.
- Multi-table discovery remains deferred until an owner-auth boundary can protect table metadata.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add saved-search, Maps, and job-board sources.
- Add authenticated plan import and governed HubSpot/Salesforce writeback.
- Add owner-authenticated multiple related tables and workbook templates.
- Publish the local feature slices after review and fresh approval.

## Review First

- `lib/grid-columns.ts` for bounded resizing and reorder guards.
- `components/pomade-data-grid.tsx` for the Glide event wiring.
- `lib/grid-columns.test.ts` for layout and execution-order coverage.
