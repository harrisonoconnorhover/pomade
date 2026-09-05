# Morning Handoff

## Finished

- Added an ICP-first company finder that preserves current rows and runs only its new list recipe.
- Added a company-to-people finder with current-profile grounding and child-row lineage.
- Added bounded Apollo enrichment for up to ten selected people with partial-success receipts.
- Added durable background jobs with progress, workspace locking, pause/resume, and retry.
- Added explicit HubSpot/Salesforce field mapping for preview-only Control Tower handoffs.

## Try It

Select a company row and choose **Find people**. Define roles, confirm the bounded provider request, then select generated people and use **Enrich selected with Apollo** if work emails are needed.

## Checks

- `npm test`: 75 tests passed across 14 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with `/api/jobs` in the route manifest.
- Isolated Worker + D1 E2E: queued formula row completed with its scoped receipt.

## Decisions

- People discovery is a scoped list recipe on one company/domain row.
- Generated people inherit company context and map verified names/titles into canonical columns.
- Private contact lookup remains a separate, explicitly confirmed Apollo action.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add saved-search, Maps, and job-board sources.
- Add authenticated plan import and governed HubSpot/Salesforce writeback.
- Add multiple related tables and workbook templates.
- Publish the local feature slices after review and fresh approval.

## Review First

- `lib/people-list-builder.ts` for scoped recipe construction and canonical mappings.
- `components/pomade-workspace.tsx` for the company-to-people workflow.
- `lib/people-list-builder.test.ts` for scope, collision, and schedule behavior.
