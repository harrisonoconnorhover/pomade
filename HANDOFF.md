# Morning Handoff

## Finished

- Added typed list research that creates up to 25 provenance-linked child rows per source row.
- Added durable one-time and recurring schedules for the whole table or captured row IDs.
- Added an ICP-first company finder that preserves current rows and runs only its new list recipe.
- Added bounded Apollo enrichment for up to ten selected people with partial-success receipts.
- Added durable background jobs with progress, workspace locking, pause/resume, and retry.

## Try It

Choose **Action → Run in background** for the selected or visible rows, confirm any provider scope, then open **Background runs** for progress and pause/resume. The isolated one-row worker test completed at 100% with the expected receipt.

## Checks

- `npm test`: 69 tests passed across 12 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with `/api/jobs` in the route manifest.
- Isolated Worker + D1 E2E: queued formula row completed with its scoped receipt.

## Decisions

- Jobs store stable row IDs and advance one row per minute through the existing guarded runner.
- The grid locks while a job may write; polling refreshes results without autosave races.
- Provider jobs require explicit consent and cap total and per-row research requests.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add people lists and saved-search, Maps, or job-board sources.
- Add CRM field mapping and governed HubSpot/Salesforce writeback.
- Add multiple related tables and workbook templates.
- Publish the local feature slices after review and fresh approval.

## Review First

- `worker.ts` for job claiming, row dispatch, leases, and progress transitions.
- `app/api/jobs/route.ts` for bounded creation and pause/resume controls.
- `components/pomade-workspace.tsx` for polling, write locks, and progress UI.
