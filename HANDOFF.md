# Morning Handoff

## Finished

- Private hosted version **34** and localhost:8798 run source `d79f057`. Local commits are saved; no GitHub push, purchases or access expansion occurred.
- Research settings edit prompts/providers in place, plus ChatGPT model/effort. Save preserves outputs, mappings and results; Cancel discards drafts. Model loading has an in-place retry.
- Existing waterfalls support provider reordering and error fallback settings. Waiting runs retain their original configuration; changed recipes pause enabled schedules.
- Columns search opens settings, including hidden fields. Explicit status/saved-view filters combine with search. Arrow keys align record details; source links select and scroll to their row on desktop and phone.
- Run receipts expose every action through searchable 100-item pages and review/passed filters. Earlier CSV, run-control, CRM refresh, transfer and lookup improvements remain. One synthetic company was verified in each dev CRM earlier tonight.

## Try It

- Open [private Pomade](https://pomade.deleteddeleted.chatgpt.site) or [local Pomade](http://localhost:8798). Their saved data and connections remain separate.
- In **Columns**, search for a research/waterfall column and open its settings. For model/effort, choose **ChatGPT subscription** and uncheck **Use app defaults**. Save or Cancel; configuration does not execute providers.
- Use **Filter** and row search, or **Run history → select a run → Needs review** and receipt search. See [the quick start](docs/workbook-quick-start.md).

## Checks

- 58 focused tests across seven files passed, plus typecheck, lint, diff checks and local/hosted production builds.
- Browser regressions passed for drafts, model inheritance/recovery, waterfall ordering, waiting-job protection, hidden-column settings, filters, receipts, row links and 390px layouts. Eleven actual local and eleven hosted smoke checks passed with zero saved-data writes or page errors.
- A real local save/reload/restore made exactly two saves on the disposable QA sheet; its contents matched afterward apart from revision/timestamp. No enrichment ran.
- An unsaved hosted research draft survived 181 seconds of natural polling; Cancel left the complete saved snapshot unchanged. Zero API mutations, provider executions or browser errors.
- Release checks preserved all 24 original local sheets and 16 hosted sheets; all 28 local saved contents remained unchanged. Seven hosted connections remain configured. Six served assets matched each build; anonymous access was blocked and Apollo callback health passed.

## Decisions

- Recipe edits retain current answers and apply on the next run.
- Preserve the existing hosted audience: one owner. Local and hosted data remain separate.

## Remaining

- Live Apollo phone enrichment needs eligible API access; unconnected adapters need credentials and live coverage.
- Fully unattended hosted timers remain unverified. ChatGPT research needs the Mac helper.

## Review First

- Column settings and [quick start](docs/workbook-quick-start.md).
- `lib/column-management.ts` and workspace filter/receipt controls.
- Browser scripts in `scripts/test-*-ui.mjs`; ignored evidence in `outputs/nightshift/2026-09-07/`.
