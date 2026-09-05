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
- [x] Bring-your-own-key web research through Parallel or Gemini with citations,
      confirmation, caching, and bounded runs.
- [x] Selected-person Apollo enrichment with identity checks and credit-aware
      confirmation.
- [x] Persistent workspace, run receipts, row review states, and a governed GTM
      Control Tower preview handoff.

## Core gaps to cross off

- [ ] Delayed and scheduled recipe execution, including deliberate recurring
      refreshes for external providers.
- [ ] Structured AI output into several typed columns, including lists that can
      become new rows.
- [ ] Ordered enrichment waterfalls with fallback rules and winning-provider
      lineage.
- [ ] Save configured columns as reusable templates; compose reusable functions
      with declared inputs and outputs.
- [ ] First-party company and people list builders from an ICP description,
      search query, Maps, or job-board source.
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

1. Structured AI output into multiple columns, because one research call should
   populate facts, confidence, and evidence separately.
2. Reusable recipe templates/functions, because repeatability is the bridge from
   a polished table to a real GTM system.
3. Ordered enrichment waterfalls, because fallback providers and winning-source
   lineage make enrichment coverage materially better.

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
