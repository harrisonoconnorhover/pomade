# Morning Handoff

## Finished

- Published owner-only Site v7 with conditional recipes, safe formula auto-update, and structured research outputs.
- Added reusable recipe functions with declared inputs and table-specific field mapping.
- Added two-to-six-source data waterfalls with first-value selection and winning-source lineage.
- Added typed list research that creates up to 25 provenance-linked child rows per source row.
- Made list reruns duplicate-free and preserved earlier rows when provider output is malformed.

## Try It

Open **AI web research**, choose **List into rows**, define fields and a result limit, then run the source row. Valid results appear immediately below it. Rerun the same source to replace its earlier generated rows.

## Checks

- `npm test`: 55 tests passed across 9 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- The retained local page and APIs compiled and returned HTTP 200.

## Decisions

- The source row remains the stable query record; list items are provenance-linked children.
- A valid rerun replaces only its own children; invalid output preserves the last useful rows.
- List output is capped at 25 items per request and keeps the existing external-request confirmation.

## Remaining

- Add delayed and scheduled recipe execution.
- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add bulk provider enrichment and a background run queue.
- Add an ICP-first company and people list-builder flow.
- Publish the three local feature slices after review and approval.

## Review First

- `lib/web-research.ts` for list validation, provenance, and rerun replacement.
- `components/pomade-workspace.tsx` for the three-shape research builder.
- `lib/web-research.test.ts` for list parsing and lifecycle coverage.
