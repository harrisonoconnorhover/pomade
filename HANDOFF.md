# Morning Handoff

## Finished

- Research columns now support editing the prompt, provider, model and effort in place. Cancel discards drafts; Save preserves IDs, output fields, mappings and existing results.
- Existing provider waterfalls support reordering and error fallback settings. Waiting runs retain their original configuration; changed recipes pause enabled schedules for review.
- Columns search opens settings directly, including hidden fields. Explicit status/saved-view filters replace cycling. Arrow keys keep record details aligned; source links scroll to the correct row on desktop and phone.
- Run receipts expose every action through 100-item pages, with full-run totals and usable mobile controls.
- Earlier night-shift CSV, run controls, CRM refresh, transfer and lookup improvements remain. One synthetic company was created and verified in each dev CRM earlier tonight. Current extension is built locally; private deployment is pending final publication checks.

## Try It

- Open **Columns**, search for a research or waterfall column, and click its settings button. Change settings, then Save or Cancel. Configuration alone does not execute providers.
- Use **Filter** to choose a status or saved view. Search combines with it; **Clear filters** resets both.
- Open a source-row link or use arrow keys with **Details** open. In **Run history**, use Previous/Next on long receipts. See `docs/workbook-quick-start.md`.

## Checks

- 58 focused tests across seven files passed. Typecheck, lint, diff checks, local build and hosted build passed.
- Browser checks passed for research drafts, model inheritance, provider ordering, waiting-job protection, hidden-column settings, receipt pagination, explicit filters, row links and 390px layouts. Synthetic saves made no provider calls. Eleven local workbook smoke checks passed with zero writes or page errors.
- A real local save/reload/restore test made exactly two saves on the disposable QA sheet; complete contents matched afterward, excluding revision/timestamp. No enrichment ran. Hosted access remains one owner; release preservation and hosted smoke checks are pending.

## Decisions

- Preserve existing columns/results when changing recipes; apply the new settings on the next run.
- Keep local and hosted data separate, with the hosted audience restricted to the existing owner. No GitHub push, purchases or access expansion.

## Remaining

- Publish and verify the prepared private version; leave localhost:8798 running.
- Actual Apollo phone enrichment needs eligible API access; other unconnected adapters need credentials and live coverage.
- Fully unattended hosted timers remain unverified. ChatGPT research needs the Mac helper.

## Review First

- `docs/workbook-quick-start.md` and Column settings in the UI.
- `lib/column-management.ts`, the grid, column finder and workspace filter/receipt controls.
- Browser regressions in `scripts/test-*-ui.mjs`; ignored screenshots in `outputs/nightshift/2026-09-07/`.
