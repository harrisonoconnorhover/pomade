# Morning Handoff

## Finished

- Added row-level conditions for every recipe and safe auto-update for local formulas.
- Added single-answer versus structured-field modes to the web-research builder.
- Made one research request populate two to six typed text, date, number, or yes/no columns.
- Preserved malformed provider output for review and exposed structured values in receipts.
- Crossed off both capabilities in the living Bitscale/Clay gap checklist.

## Try It

Open **Research with AI**, choose **Structured fields**, adjust the four starter outputs, and add the recipe. Open **Recipe engine** to gate it with a row condition, select a row, and run after reviewing the request count.

## Checks

- `npm test`: 40 tests passed across 8 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Local page, workspace, and research endpoints returned HTTP 200.

## Decisions

- Structured research supports two to six scalar outputs; list expansion remains a separate slice.
- Every declared key is required, and malformed output stays visible but requires review.
- External research remains manual and credit-confirmed even when local formulas auto-update.

## Remaining

- Save configured recipes as reusable templates/functions.
- Add enrichment waterfalls with fallback lineage.
- Support list outputs that can explode into rows.
- Add delayed and scheduled recipe execution.
- Publish the two locally committed slices after explicit direct-`main` approval.

## Review First

- `lib/web-research.ts` for schema prompting, parsing, and review behavior.
- `components/pomade-workspace.tsx` for the structured-output builder.
- `app/api/runs/route.ts` for conditional request counting and application.
