# Morning Handoff

## Finished

- Added two-to-six-source data waterfalls with first-value selection and winning-source lineage.
- Added typed list research that creates up to 25 provenance-linked child rows per source row.
- Added durable one-time and recurring schedules for the whole table or captured row IDs.
- Added an ICP-first company finder that preserves current rows and runs only its new list recipe.
- Added bounded Apollo enrichment for up to ten selected people with partial-success receipts.

## Try It

Select up to ten rows and choose **Action → Enrich selected with Apollo**. The dialog shows eligible/skipped rows and maximum credits before confirmation. **Find companies** remains the ICP-first source flow.

## Checks

- `npm test`: 66 tests passed across 11 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Unconfirmed batch HTTP check: rejected with `400` before provider execution.

## Decisions

- Apollo batches cap selection at ten, use two concurrent calls, and coalesce duplicate identities.
- Partial provider failures leave failed rows unchanged while successful receipts are persisted.
- New provider recipes pause an active schedule until its expanded scope is approved.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add a background run queue.
- Add people lists and saved-search, Maps, or job-board sources.
- Add per-row progress, pause, retry, and resumable failures.
- Publish the local feature slices after review and fresh approval.

## Review First

- `lib/company-list-builder.ts` for additive workspace construction and scope mapping.
- `components/pomade-workspace.tsx` for the builder and provider confirmation flow.
- `lib/web-research.ts` for generated-row canonical field projection.
