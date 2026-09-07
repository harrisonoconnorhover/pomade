# Morning Handoff

## Finished

- Added **Columns** search, click-to-jump, individual hide/show and Show all. Visibility persists with the sheet; hidden data, formulas and enrichment steps remain intact.
- Added **Provider catalog** with provider/action search, Email/Phone/Company/Research filters, required inputs and account connection badges before selection.
- Catalog choices open existing provider or research setup. Research selection persists for single answers, structured fields and lists. Company presets can be saved before connecting a key.
- Added ordered related-sheet tabs from actual workbook membership, preserving account boundaries and navigation/save guards.
- Released all three features locally at http://localhost:8798 and to the existing owner-private site (hosted version 29, source `da0d904`).

## Try It

- Open **Columns**, search a name and click it to jump. Uncheck a column to hide it; use Show all to restore the full view.
- Open **Enrich → Provider catalog**, or choose Email & phone / AI research from Add column. Search a provider, check its required inputs, then configure the action. Creating a column does not run it.
- Open a workbook created from a prompt; related sheets appear beneath the main sheet switcher. Standalone sheets keep the general switcher.

## Checks

- 127 focused tests passed across eight files, covering hidden-column execution and merging, visible drag mapping, provider search and status, workbook membership, existing provider factories and recipe execution.
- Typecheck, lint, diff checks, and both local/hosted production builds passed.
- Live checks passed: 24 local and 16 hosted table IDs preserved, seven hosted connections intact, managed Apollo callback unchanged, anonymous workbook access returns 401. Three related sheets expose correct plan membership in each version; catalog connection endpoints respond correctly.
- Four served JavaScript/CSS assets per version match their respective production builds. Evidence: ignored `outputs/navigation/2026-09-07/release-check.json`.
- No browser interaction or visual QA was performed for this implementation.

## Decisions

- Visibility is display-only; full-sheet exports and recipe inputs include hidden fields.
- Configured keys do not imply paid API scope. Apollo phone setup still requires its key and public callback; ChatGPT research still requires the Mac.
- Keep the existing owner-private hosting audience and local data. No GitHub push or live provider enrichment is part of this update.

## Remaining

- Real Apollo phone calls still require eligible API access; the callback service is unchanged.

## Review First

- `components/column-finder.tsx`, `lib/grid-columns.ts` and grid integration.
- `components/provider-catalog.tsx`, `lib/provider-catalog.ts` and builder selection.
- `lib/workbook.ts`, related-sheet navigation and `app/workspace.css`.
