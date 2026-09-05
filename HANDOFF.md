# Morning Handoff

## Finished

- Added durable one-time and recurring schedules for the whole table or captured row IDs.
- Added an ICP-first company finder that preserves current rows and runs only its new list recipe.
- Added bounded Apollo enrichment for up to ten selected people with partial-success receipts.
- Added durable background jobs with progress, workspace locking, pause/resume, and retry.
- Added explicit HubSpot/Salesforce field mapping for preview-only Control Tower handoffs.

## Try It

Select a row, choose **Prepare CRM handoff**, switch between HubSpot and Salesforce, and review the suggested mapping and clean-record warning before downloading the preview plan. Pomade still performs no CRM write.

## Checks

- `npm test`: 72 tests passed across 13 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with `/api/jobs` in the route manifest.
- Isolated Worker + D1 E2E: queued formula row completed with its scoped receipt.

## Decisions

- CRM mappings use Control Tower's portable contact fields and show provider-native destinations.
- Downloaded plans include mapped fields only and keep record creation blocked.
- Approval, provider writes, receipts, and rollback stay exclusively in GTM Control Tower.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add people lists and saved-search, Maps, or job-board sources.
- Add authenticated plan import and governed HubSpot/Salesforce writeback.
- Add multiple related tables and workbook templates.
- Publish the local feature slices after review and fresh approval.

## Review First

- `lib/control-tower-adapter.ts` for suggestions, validation, and payload shaping.
- `components/pomade-workspace.tsx` for destination and mapping UX.
- `lib/control-tower-adapter.test.ts` for provider-specific contract coverage.
