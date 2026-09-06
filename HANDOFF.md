# Morning Handoff

## Finished

- Compared ChatGPT Luna/low and Astra/medium with Parallel speed, base and raw Search on the three DemandDrive companies.
- Saved the prompts, exact responses, timings, citation evidence and recommendation report locally.
- Added all 15 reviewed results to new comparison sheets in local and private hosted Pomade after user approval.
- Included source links and review flags for stale hiring, ambiguous company identity and unsupported citations.

## Try It

- Open [the hosted comparison](https://pomade.deleteddeleted.chatgpt.site/?table=4ec93d57-9c47-4b1b-bc09-5b88c38de0e9) or [the local comparison](http://localhost:8798/?table=9298258c-01e1-4392-89e7-3548174204f3).
- Read [the provider comparison](docs/research-provider-comparison-2026-09-06.md) for the recommendation and limitations.
- Existing ChatGPT model controls remain under **Add AI web research → Research settings**. Provider selection is still an installation setting.

## Checks

- All 15 benchmark calls completed: 12 structured research responses and three Search responses. All 12 answers parsed; 11 had accepted citation receipts.
- Prior direct-page checks confirmed HealthEdge requisition 2026-8232 and Solera BDR JR-019664; Solera SDR JR-019383 showed a missing-page state.
- Importer syntax check passed. API readback matched all 15 rows and 13 columns in both installations; each gained exactly one sheet and existing table summaries were unchanged.
- The import reused saved results without additional research calls. Earlier Parallel consumption was estimated at $0.06 at list rates; exact billing and per-run Codex usage were unavailable.
- Documentation links, receipt consistency and diff whitespace checked. No runtime code changed; no build or regression suite was needed.

## Decisions

- Prefer Parallel for routine first-pass enrichment and Astra/medium for difficult, valuable claims requiring direct verification.
- Treat three companies as a diagnostic sample, not an accuracy score. Date the review notes and leave unverified fields blank.
- Create new comparison sheets using the approved account connections and retain exact import receipts locally.

## Remaining

- Per-column provider selection and conditional Parallel-to-Codex research fallback are future improvements.
- Broader sampling and per-run Codex usage reporting would improve cost and quality comparisons.

## Review First

- The comparison sheets, especially **Assessment** and **Review notes**.
- `docs/research-provider-comparison-2026-09-06.md`.
- `outputs/research-comparison-2026-09-06/comparison-tables.json` for verified sheet IDs.
