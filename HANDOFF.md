# Morning Handoff

## Finished

- Compared ChatGPT Luna/low and Astra/medium with Parallel speed, base and raw Search on the three DemandDrive companies.
- Saved the prompts, exact responses, timings, citation evidence and a recommendation report locally.
- Independently verified Astra's HealthEdge and Solera hiring leads; identified a stale Solera listing in Parallel base's output.
- Recorded one Luna result that needs review because no citations survived Pomade's quote checks.

## Try It

- Read [the provider comparison](docs/research-provider-comparison-2026-09-06.md).
- Inspect exact answers in `outputs/research-comparison-2026-09-06/`, including `results.json`, `base-results.json` and `summary.json`.
- Existing ChatGPT model controls remain under **Add AI web research → Research settings**. Provider selection is still an installation setting.

## Checks

- All 15 live calls completed: 12 structured research responses and three Search responses. All 12 answers parsed as valid structured data; 11 had accepted citation receipts.
- Median seconds per company: Search 2.19, speed 2.94, base 11.51, Luna/low 38.92, Astra/medium 67.55.
- HealthEdge requisition 2026-8232 was verified on its direct iCIMS page. Solera BDR JR-019664 loaded with Apply; the SDR JR-019383 referenced by Parallel base showed a missing-page state on two URL variants.
- Estimated Parallel list-rate consumption was $0.06. Exact account billing and per-run Codex token/credit usage were not available.
- Only standalone report files changed; no runtime build or regression suite was needed. Report links, result counts and diff whitespace were checked.

## Decisions

- Prefer Parallel for routine first-pass enrichment and Astra/medium for difficult, valuable claims requiring direct verification.
- Treat three companies as a diagnostic sample; valid JSON, source counts and null values are not accuracy scores.
- Deliver a standalone report after automatic approval review blocked optional writes to app comparison sheets due to persistence and possible overwrite risk.

## Remaining

- Per-column provider selection and conditional Parallel-to-Codex research fallback are future improvements.
- Broader sampling and per-run Codex usage reporting would improve cost and quality comparisons.
- Native app comparison sheets were not created; the standalone comparison is complete.

## Review First

- `docs/research-provider-comparison-2026-09-06.md`.
- `outputs/research-comparison-2026-09-06/solera-parallel-base.json` and live Solera verification files.
- `outputs/research-comparison-2026-09-06/solera-codex-luna-low.json` for the citation limitation.
