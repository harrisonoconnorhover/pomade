# Morning Handoff

## Finished

- Published owner-only Site v7 with conditional recipes, safe formula auto-update, and structured research outputs.
- Added a persistent recipe library for formulas, deterministic enrichments, and web-research columns.
- Added declared input mapping so saved functions work across tables with different column names.
- Added ordered two-to-six-source waterfalls that write the first available value and its winning source.
- Crossed reusable recipe functions and field-level enrichment waterfalls off the Clay/Bitscale gap checklist.

## Try It

Open **Recipe engine**, choose **Save template** on any recipe, then reuse it from **Recipe library** with mapped inputs. To combine provider results, add **Data waterfall**, order two or more source columns, and inspect the adjacent source-lineage output.

## Checks

- `npm test`: 50 tests passed across 9 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Local page, workspace, and research endpoints returned HTTP 200.

## Decisions

- Reusable functions keep explicit inputs, collision-safe typed outputs, conditions, and runner settings.
- Waterfalls compose visible upstream columns and never create another provider request.
- Templates and waterfalls remain workspace data and survive CSV or CRM source replacement.

## Remaining

- Support list outputs that can explode into rows.
- Add delayed and scheduled recipe execution.
- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Add bulk provider enrichment and a background run queue.
- Publish the reusable-function and waterfall slices after review and approval.

## Review First

- `lib/local-recipe-engine.ts` for waterfall selection and lineage receipts.
- `lib/recipe-templates.ts` for portable input/output contracts.
- `components/pomade-workspace.tsx` for the template library and waterfall builder.
