# Morning Handoff

## Finished

- Added guarded row deletion with descendant cleanup and captured-schedule pruning.
- Added stable-ID column renaming through native Glide header menus.
- Added immediate and background single-recipe runs from each recipe header menu.
- Added a transparent recent-usage summary for local/provider actions, cache hits, observed credits, and unknown cost.
- Added bounded latest-20 workspace versions with reversible, automation-safe restore.

## Try It

Choose **Action → Version history**, select a snapshot, and confirm restore. Pomade archives the current table first and pauses any restored schedule. Open **Run history** for the separate receipt-backed usage summary.

## Checks

- `npm test`: 93 tests passed across 21 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with `/api/workspace/versions` in the route manifest.
- Isolated Worker + D1 E2E: queued formula row completed with its scoped receipt.
- Local D1 E2E: edit created a version, restore matched original content, and the displaced current table was archived.

## Decisions

- Timestamp-only saves do not create versions; changed snapshots retain the newest 20.
- Restore is blocked during active jobs and restored schedules always return paused.
- The API remains fixed to the existing owner workspace; arbitrary workspace discovery is still deferred pending auth.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add saved-search, Maps, and job-board sources.
- Add authenticated plan import and governed HubSpot/Salesforce writeback.
- Add owner-authenticated multiple related tables and workbook templates.
- Publish the local feature slices after review and fresh approval.

## Review First

- `app/api/workspace/versions/route.ts` for bounded listing and guarded restore.
- `db/workspace-store.ts` for deduplicated snapshots and latest-20 retention.
- `components/pomade-workspace.tsx` for version-history presentation and restore flow.
