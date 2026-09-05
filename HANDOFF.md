# Morning Handoff

## Finished

- Added guarded row deletion and dependency-aware column deletion with recovery through versions.
- Added stable-ID column renaming through native Glide header menus.
- Added immediate and background single-recipe runs from each recipe header menu.
- Added a transparent recent-usage summary for local/provider actions, cache hits, observed credits, and unknown cost.
- Added bounded latest-20 workspace versions with reversible, automation-safe restore.

## Try It

Open a column header menu to rename, run, or delete it. Deletion lists formula, recipe, output, and saved-view blockers before it can remove values. Use **Action → Version history** to recover an earlier table.

## Checks

- `npm test`: 97 tests passed across 21 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with `/api/workspace/versions` in the route manifest.
- Isolated Worker + D1 E2E: queued formula row completed with its scoped receipt.
- Local D1 E2E: edit created a version, restore matched original content, and the displaced current table was archived.

## Decisions

- Column deletion blocks known recipe, condition, output, and saved-view dependencies.
- Generated child rows become static data when their creating recipe column is removed.
- Deleting the final recipe pauses any schedule; version history remains the recovery path.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add saved-search, Maps, and job-board sources.
- Add authenticated plan import and governed HubSpot/Salesforce writeback.
- Add owner-authenticated multiple related tables and workbook templates.
- Publish the local feature slices after review and fresh approval.

## Review First

- `lib/column-management.ts` for dependency discovery and safe removal.
- `components/pomade-workspace.tsx` for blocker presentation and confirmation.
- `lib/column-management.test.ts` for dependency, status, schedule, and child-row coverage.
