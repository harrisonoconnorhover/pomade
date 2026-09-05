# Morning Handoff

## Finished

- Crossed off row-level recipe conditions with six practical comparison operators.
- Added one settings surface for every formula, deterministic enrichment, and web-research column.
- Made safe formula columns auto-update in dependency order after an input cell changes.
- Counted condition-skipped actions in run receipts and excluded them from research request totals.
- Updated the living Bitscale/Clay capability checklist and product boundaries.

## Try It

Open **Recipe engine** or **Action → Recipe run settings**. Set **Personal opener** to run only if **Title contains founder**, then run the grid. Add a formula column and edit one of its source cells to see local auto-update.

## Checks

- `npm test`: 35 tests passed across 8 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Local app and persistence APIs returned HTTP 200 after hot reload.

## Decisions

- One clear condition per recipe is the first complete slice; nested rule groups remain unnecessary until real use demands them.
- Conditions are evaluated before provider requests, so skipped research does not spend a request.
- Auto-update is limited to deterministic local formulas; external enrichments remain explicit.

## Remaining

- Produce structured AI output across multiple typed columns.
- Save configured recipes as reusable templates/functions.
- Add enrichment waterfalls with fallback lineage.
- Add delayed and scheduled recipe execution.
- Continue down `docs/capability-gap.md` without claiming broad feature parity.

## Review First

- `components/pomade-workspace.tsx` for the recipe-settings flow.
- `lib/local-recipe-engine.ts` for condition and auto-update semantics.
- `app/api/runs/route.ts` for cost-aware research gating.
