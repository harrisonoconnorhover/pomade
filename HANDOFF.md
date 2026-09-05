# Morning Handoff

## Finished

- Published owner-only Site v7 with conditional recipes, safe formula auto-update, and structured research outputs.
- Added reusable recipe functions with declared inputs and table-specific field mapping.
- Added two-to-six-source data waterfalls with first-value selection and winning-source lineage.
- Added typed list research that creates up to 25 provenance-linked child rows per source row.
- Added durable one-time and recurring schedules for the whole table or captured row IDs.

## Try It

Open **Action → Schedule recipe run**, choose a future time and cadence, then select the whole table or the row IDs captured when the dialog opened. Research schedules require explicit provider-request consent.

## Checks

- `npm test`: 62 tests passed across 10 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Local scheduled-event handler returned `ok` with retries disabled.

## Decisions

- One-time schedules provide delayed execution; recurring options use fixed 24-hour or 7-day intervals.
- Due work uses the existing guarded run endpoint, request ceiling, cache, and receipts.
- Schedules are claimed optimistically and stop after an error instead of repeating provider spend.

## Remaining

- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add bulk provider enrichment and a background run queue.
- Add an ICP-first company and people list-builder flow.
- Add per-row progress, pause, retry, and resumable failures.
- Publish the four local feature slices after review and approval.

## Review First

- `worker.ts` for due-work claiming and guarded execution.
- `lib/recipe-schedule.ts` for the schedule state machine.
- `components/pomade-workspace.tsx` for scheduling controls and cost consent.
