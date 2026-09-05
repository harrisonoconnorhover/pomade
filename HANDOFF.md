# Morning Handoff

## Finished

- Published owner-only Site v7 with conditional recipes, safe formula auto-update, and structured research outputs.
- Added a persistent recipe library for formulas, deterministic enrichments, and web-research columns.
- Added declared input mapping so saved functions work across tables with different column names.
- Recreates collision-safe typed outputs while preserving conditions, prompts, and auto-update behavior.
- Crossed reusable recipe templates/functions off the living Clay/Bitscale gap checklist.

## Try It

Open **Recipe engine**, choose **Save template** on any recipe, name it, and save. Open **Recipe library**, choose **Use**, review the input mappings, and add the function; local formulas populate immediately.

## Checks

- `npm test`: 46 tests passed across 9 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Local page, workspace, and research endpoints returned HTTP 200.

## Decisions

- A reusable function is one configured recipe with explicit inputs and one or more typed outputs.
- Mappings live on each instantiated column, so the saved formula or prompt remains portable.
- Templates stay in the persisted workspace and survive CSV or CRM source replacement.

## Remaining

- Add enrichment waterfalls with fallback lineage.
- Support list outputs that can explode into rows.
- Add delayed and scheduled recipe execution.
- Add generic HTTP enrichment plus inbound and outbound webhooks.
- Publish the reusable-function slice after review and approval.

## Review First

- `lib/recipe-templates.ts` for template contracts, input mapping, and output instantiation.
- `components/pomade-workspace.tsx` for save/use/library flows.
- `lib/local-recipe-engine.ts` and `lib/web-research.ts` for mapped-input execution.
