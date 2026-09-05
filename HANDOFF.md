# Morning Handoff

## Finished

- Pomade's Codex research provider now opens public websites in local Playwright/Chromium. The model chooses relevant links through a read-only browser MCP tool and returns the existing typed table outputs.
- Browser mode is enabled on this Mac. Each research request gets an isolated browser with a six-page budget; the browser starts and closes automatically through the existing Codex helper.
- Citations require an exact quotation from a successfully visited final URL. Run receipts expose browser visits, timestamps, outcomes and checked quotations; row evidence and cached results preserve them.
- Live research passed for HealthEdge, Clearwater Security and Solera in **DemandDrive — Local browser research**. Each read its homepage plus a relevant second page: six pages and seven checked quotations total.
- All three repeat runs reused cached browser results. The same work ran through Pomade's previously registered MCP connection. Nothing was published or pushed to GitHub.

## Try It

Open http://localhost:8798 and select **DemandDrive — Local browser research**. Inspect the offering, business-customer flag and target-customer fields, then open a run receipt's **Browser visits** section.

The local preview and Codex helper are running. After restarting the Mac, run `npm run research:codex` and `npm run start -- --port 8798` in separate terminals. Installation and switching modes are in `docs/local-browser-research.md`.

Use the existing research editor or MCP `run_recipe` tool for another question. Keep synchronous browser calls to one account at a time. Mode changes require rebuilding and restarting the preview.

## Checks

- 23 focused tests passed, including real Chromium rendering, link navigation, blocked pages, page budgets, POST blocking, private URL rejection, quotation validation and research persistence.
- TypeScript, lint, script syntax checks and production build passed.
- Three live account runs passed with six recorded page reads and seven accepted quotations; all results persisted. A three-row repeat hit the cache for every row.
- Private evidence: `outputs/browser-research-live.json`.

## Decisions

- Reuse the subscription helper, recipe pipeline, cache and MCP interface; run browsers locally for personal batches.
- Check source quotations against actually returned page text. Missing/blocked evidence stays unknown or in review.
- Keep clean public-site browser contexts; preserve the user's signed-in Chrome profile separately.

## Remaining

- Authenticated websites, broader UI interactions, alternate LLM providers and larger evaluations.
- Whole-market discovery and easier conversational creation of tables/recipes.
- Mid-research recovery across helper crashes; the existing pipeline already retains completed rows.

## Review First

- `docs/local-browser-research.md` and the new table's run receipts.
- `scripts/research-browser.mjs` and `scripts/codex-research.mjs`.
- `outputs/browser-research-live.json` for the six-page live check and cache replay.
