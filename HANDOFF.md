# Morning Handoff

## Finished

- Added a dated, official-source capability checklist for Pomade versus Bitscale and Clay.
- Crossed off custom merge formulas with column tokens and safe text transforms.
- Added a builder with variable chips and a live five-row preview before the column is created.
- Made formulas run in visual column order so later formulas can use earlier outputs.
- Documented the formula syntax and non-executable safety boundary.

## Try It

Open **Add recipe column → Custom formula**. Try `{{person | first}} at {{company | upper}}`, review the five-row preview, add the column, and run selected or visible rows.

## Checks

- `npm test`: 31 tests passed across 8 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Local app and persistence APIs returned HTTP 200 after hot reload.

## Decisions

- Formula inputs are text templates with an allowlist of transforms, never executable JavaScript.
- Unknown columns render blank and unknown transforms leave the value unchanged.
- The next core slice is conditional run settings and automatic updates.

## Remaining

- Add conditional run settings and automatic updates.
- Produce structured AI output across multiple typed columns.
- Save configured recipes as reusable templates/functions.
- Add enrichment waterfalls with fallback lineage.
- Continue down `docs/capability-gap.md` without claiming broad feature parity.

## Review First

- `components/pomade-workspace.tsx` for the formula-builder flow.
- `lib/local-recipe-engine.ts` for safe rendering and column-order execution.
- `docs/capability-gap.md` for the scoped product roadmap and official references.
