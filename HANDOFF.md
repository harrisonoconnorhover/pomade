# Morning Handoff

## Finished

- Added reusable recipe functions with declared inputs and table-specific field mapping.
- Added two-to-six-source data waterfalls with first-value selection and winning-source lineage.
- Added typed list research that creates up to 25 provenance-linked child rows per source row.
- Added durable one-time and recurring schedules for the whole table or captured row IDs.
- Added an ICP-first company finder that preserves current rows and runs only its new list recipe.

## Try It

Click **Find companies**, describe the ICP, choose a one-to-25 result cap, and continue. Review the exact one-request scope, then confirm to create evidence-backed company rows.

## Checks

- `npm test`: 65 tests passed across 11 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.

## Decisions

- The company finder reuses list research and canonical company/domain fields instead of a parallel execution path.
- Existing rows stay in place; one editable ICP source row drives generated child rows.
- New provider recipes pause an active schedule until its expanded scope is approved.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add bulk provider enrichment and a background run queue.
- Add people lists and saved-search, Maps, or job-board sources.
- Add per-row progress, pause, retry, and resumable failures.
- Publish the local feature slices after review and fresh approval.

## Review First

- `lib/company-list-builder.ts` for additive workspace construction and scope mapping.
- `components/pomade-workspace.tsx` for the builder and provider confirmation flow.
- `lib/web-research.ts` for generated-row canonical field projection.
