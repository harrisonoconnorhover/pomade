# Morning Handoff

## Finished

- Added a company-to-people finder with current-profile grounding and child-row lineage.
- Added bounded Apollo enrichment for up to ten selected people with partial-success receipts.
- Added durable background jobs with progress, workspace locking, pause/resume, and retry.
- Added explicit HubSpot/Salesforce field mapping for preview-only Control Tower handoffs.
- Added persistent named filtered views with live counts and sidebar switching.

## Try It

Choose **Save a view** in the sidebar, select a column and rule, then save it. The view appears beside Ready/Review with a live count and continues updating as recipes change row values.

## Checks

- `npm test`: 78 tests passed across 15 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with `/api/jobs` in the route manifest.
- Isolated Worker + D1 E2E: queued formula row completed with its scoped receipt.

## Decisions

- Saved views persist one explicit column rule and recompute from current rows.
- Search and row selection remain temporary instead of silently changing a view.
- Multi-table discovery remains deferred until an owner-auth boundary can protect table metadata.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add saved-search, Maps, and job-board sources.
- Add authenticated plan import and governed HubSpot/Salesforce writeback.
- Add owner-authenticated multiple related tables and workbook templates.
- Publish the local feature slices after review and fresh approval.

## Review First

- `lib/saved-views.ts` for view validation and row matching.
- `components/pomade-workspace.tsx` for view creation and sidebar navigation.
- `lib/saved-views.test.ts` for matching and validation coverage.
