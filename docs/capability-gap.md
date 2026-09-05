# Pomade capability gap

Baseline: 2026-09-04. This is a living product checklist, not a claim that
Pomade matches the maturity, throughput, provider coverage, or reliability of
Bitscale or Clay.

## Already working

- [x] Fast editable grid with copy, paste, fill, row selection, search, sort,
      filters, CSV import, and CSV export.
- [x] Read-only HubSpot contact and Salesforce lead preview/import.
- [x] Deterministic formula and enrichment recipe columns with selected-row or
      visible-row execution.
- [x] Custom merge formulas with column tokens, safe transforms, column-order
      dependencies, and a five-row preview. Crossed off 2026-09-04.
- [x] Row-level recipe conditions with empty, equality, and contains operators;
      skipped actions are counted in receipts. Crossed off 2026-09-04.
- [x] Safe local formula auto-update after cell edits, with dependency-order
      recalculation and editable overrides. Crossed off 2026-09-04.
- [x] Structured web-research output into two to six typed text, date, number,
      or yes/no columns from one provider request. Crossed off 2026-09-04.
- [x] List-valued AI research with typed fields, configurable one-to-25-result
      limits, child-row provenance, and duplicate-free reruns. Crossed off
      2026-09-04.
- [x] First-party ICP company-list builder with a preserved source row,
      canonical company/domain mapping, five structured fields, scoped provider
      confirmation, and additive insertion into the current table. Crossed off
      2026-09-04.
- [x] Durable delayed, every-24-hour, and every-seven-day recipe runs for the
      whole table or captured row IDs, with explicit provider consent and
      stop-on-error behavior. Crossed off 2026-09-04.
- [x] Save configured columns as reusable recipe functions with declared input
      mapping, collision-safe typed outputs, conditions, and auto-update
      behavior. Crossed off 2026-09-04.
- [x] Ordered two-to-six-step enrichment-field waterfalls with configurable
      priority, automatic recalculation, and winning-source lineage. Crossed off
      2026-09-04.
- [x] Bring-your-own-key web research through Parallel or Gemini with citations,
      confirmation, caching, and bounded runs.
- [x] Selected-person Apollo enrichment with identity checks and credit-aware
      confirmation.
- [x] Persistent workspace, run receipts, row review states, and a governed GTM
      Control Tower preview handoff.

## Core gaps to cross off

- [ ] First-party people lists plus company/people sourcing from saved searches,
      Maps, and job-board sources.
- [ ] Generic HTTP API enrichment plus inbound and outbound webhooks.
- [ ] Background run queue with per-row progress, pause, retry, and resumable
      failures.
- [ ] Bulk provider enrichment instead of Apollo's current one-row action.
- [ ] CRM field mapping and governed HubSpot/Salesforce writeback through GTM
      Control Tower.
- [ ] Multiple tables in a workbook, reusable workbook templates, and table
      relationships.
- [ ] Event-driven workflows with triggers, branching, code steps, and actions.
- [ ] Persistent people/company profiles, deduplicated audiences, and dynamic
      segments.
- [ ] Recurring signals for job changes, hiring, news, fundraising, and other
      account events.
- [ ] Public API to append rows and run selected output columns synchronously or
      asynchronously.
- [ ] Team collaboration, access controls, structural version history, and
      restore.
- [ ] Real provider-credit ledger, per-step cost estimates, budgets, and usage
      reporting.
- [ ] Reusable research agents with business context, documents, tools, model
      choice, and structured outputs.

## Useful but not required for the core

- [ ] Native email sequencing, mailboxes, reply automation, and campaign
      analytics. Pomade can remain enrichment-first and hand off to a sequencer.
- [ ] Native advertising-audience sync. This is a later distribution surface,
      not a prerequisite for a strong enrichment grid.

## Next three slices

1. A background queue with per-row progress and resumable failures, so larger
   provider runs do not depend on one request staying open.
2. Bulk provider enrichment, starting with the existing guarded Apollo person
   match instead of requiring one active-row action at a time.
3. CRM field mapping and governed writeback through GTM Control Tower, keeping
   preview, approval, receipt, and rollback outside the enrichment grid.

## Official product references

Bitscale documents grids, action/formula/merge columns and templates in its
[feature reference](https://docs.bitscale.ai/feature-reference/introduction),
custom and AI-generated formulas in
[Common Formulae](https://docs.bitscale.ai/ingredients/common-formulae), reusable
column templates in
[Tutorial: Column Templates](https://docs.bitscale.ai/ingredients/tutorial-column-templates),
live scraping and structured fields/lists in
[BitAgent](https://docs.bitscale.ai/ingredients/tools-linkscrape), scheduled
sources in
[Scheduling](https://docs.bitscale.ai/ingredients/source-scheduling), webhooks in
[Webhook Export](https://docs.bitscale.ai/ingredients/integrations-webhook-export),
and programmable grid execution in its
[Grid API reference](https://docs.bitscale.ai/ingredients/bitscale-api-reference).

Clay documents sources and schedules in
[Sources](https://university.clay.com/docs/sources), provider fallback in
[Data Waterfalls](https://university.clay.com/docs/building-a-data-waterfall),
conditional and delayed runs in
[Enrichments](https://university.clay.com/docs/enrichments), reusable steps in
[Functions](https://university.clay.com/docs/functions), branching automation in
[Workflows](https://university.clay.com/docs/workflows), unified profiles and
writeback in [Audiences](https://university.clay.com/docs/audiences), monitoring
in [Signals](https://university.clay.com/docs/signals), arbitrary APIs in
[HTTP API integration](https://university.clay.com/docs/http-api-integration-overview),
reusable research agents in
[Claygent Builder](https://university.clay.com/docs/claygent-builder), and
structural restore in
[Table Versions](https://university.clay.com/docs/table-versions).
