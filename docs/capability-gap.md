# Pomade capability gap

Baseline: 2026-09-05 (official documentation refreshed). This is a living product checklist, not a claim that
Pomade matches the maturity, throughput, provider coverage, or reliability of
Bitscale or Clay.

The detailed acceptance status for the latest request is maintained in
[requested workflows](requested-workflows.md). Account access and live evidence
remain separate from implemented features.

## Already working

- [x] Verified-status email/phone waterfall acceptance, Hunter/Apollo email presets,
      rich Apollo company data and a PDL company adapter. Actual multi-provider
      access and verified-phone match coverage remain unproven.
- [x] Source-linked account signals, set comparisons, current-job verification and
      signal fields for qualification/CRM; buying-intent sources are fixture-only.
- [x] Native custom-field metadata and typed CRM writes/imports. Scheduled qualified
      revenue/employee updates and reviewed score/tier/tag round trips verified
      for three companies in each dev CRM. Saved automation includes those custom
      fields; a one-time scheduled check verified six unchanged records.

- [x] Named CRM mappings per table and verified native-ID copying from receipts.
      Exact matching saved mappings reuse copied IDs; changed/conflicting rows
      remain untouched. Four saved mappings verified against the 12 existing
      dev CRM records on 2026-09-05 with unchanged-only actions.

- [x] Apollo company enrichment preset with server-side existing-key connection,
      domain normalization/match checking and basic or rich mapped outputs. Docs plus
      live three-company Free-tier enrichment verified 2026-09-05; actual credit
      usage was not returned by Apollo.

- [x] Watched-field change signals from recipe runs, scheduled API refreshes and
      transfers, with stable-row baselines, old/new values, review state and
      paginated history. Bounded event details; crossed off 2026-09-05.

- [x] Saved function version history with per-copy update/rollback preview,
      stable output IDs, retained values and paused schedules. Compatible step/
      output shapes only; crossed off 2026-09-05.

- [x] Conditional transfer fan-out to up to five distinct scheduled destinations,
      with source/child-row routing, per-branch receipts and atomic destination
      completion. Crossed off 2026-09-05; nested workflow graphs remain open.

- [x] Local workbook templates for one to ten empty connected tables, including
      nested recipe lookup remapping, captured transfers, paused schedules and
      explicit compatible outside-table bindings. Crossed off 2026-09-05.

- [x] Scheduled bounded API-source refresh with stable-ID mapped updates,
      retained fetch batches, whole-table recipe execution and optional transfer.
      Partial/limited fetches stop before input changes. Crossed off 2026-09-05.

- [x] Scheduled all-recipe or function-only runs followed by a captured mapped
      table transfer, with original-row scope and stop-on-error behavior.
      Crossed off 2026-09-05; arbitrary branching remains a gap.

- [x] Save two-to-ten-step same-row recipe functions, reuse across local tables
      with mapped external inputs and connected internal outputs, and run or
      queue just their steps. Independent copies; crossed off 2026-09-05.

- [x] Fast editable grid with copy, paste, fill, row selection, search, sort,
      filters, persistent column resizing, safe drag reordering, guarded row
      deletion, stable-ID column renaming, dependency-aware column deletion,
      CSV import, and CSV export.
- [x] Persistent named views with column rules, live row counts, sidebar
      switching, automatic value updates, and safe removal. Crossed off
      2026-09-05.
- [x] HubSpot company/contact and Salesforce account/contact/lead preview/import.
- [x] Direct local mapped CRM creates/updates with before/after preview, native-ID
      receipts, read-back checks and no-op/replay behavior. Three companies and
      three contacts written and imported in each dev CRM on 2026-09-05.
      Native HubSpot associations and event-driven continuous synchronization remain open.
- [x] Deterministic formula and enrichment recipe columns with selected-row or
      visible-row execution, including immediate or background single-column
      runs from the grid header. Crossed off 2026-09-05.
- [x] Custom merge formulas with column tokens, safe transforms, column-order
      dependencies, and a five-row preview. Crossed off 2026-09-04.
- [x] Row-level recipe conditions with numeric, empty, equality and contains operators, combined with AND/OR;
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
- [x] Save configured columns as reusable single-column recipe templates with declared input
      mapping, collision-safe typed outputs, conditions, and auto-update
      behavior. Crossed off 2026-09-04.
- [x] Ordered two-to-six-step enrichment-field waterfalls with configurable
      priority, automatic recalculation, and winning-source lineage. Crossed off
      2026-09-04.
- [x] Bring-your-own-key web research through Parallel or Gemini with citations,
      confirmation, caching, and bounded runs.
- [x] Selected-person Apollo enrichment with identity checks and credit-aware
      confirmation.
- [x] Bounded Apollo batch enrichment for up to ten selected rows, with missing
      input skips, duplicate-request coalescing, partial-success persistence,
      per-row receipts, and a confirmed maximum credit count. Crossed off
      2026-09-04.
- [x] Durable background recipe jobs for up to 100 stable row IDs, with
      one-row progress, grid write locking, pause/resume, failed-row retry,
      expired-lease recovery, scoped provider consent, and ordinary per-row run
      receipts. Crossed off 2026-09-04.
- [x] Persistent workspace, run receipts, row review states, and a governed GTM
      Control Tower preview handoff.
- [x] Transparent recent-usage summary separating local and provider actions,
      cache hits, observed provider-reported credits, and unknown-cost actions.
      This remains a receipt snapshot, not a billing ledger. Crossed off
      2026-09-05.
- [x] Explicit CRM field mapping for HubSpot Contacts and Salesforce Leads,
      including portable suggestions, native destination names, missing-gate
      warnings, and mapped-only Control Tower preview payloads. Crossed off
      2026-09-04.
- [x] First-party people finder from any company/domain row, with bounded role
      criteria, current-public-profile grounding, canonical person/title
      projection, child-row lineage, and an Apollo-ready follow-on. Crossed off
      2026-09-05.

- [x] Portable versioned recipe JSON import/export with input remapping across
      installations; imports add library entries without executing recipes.
      Crossed off 2026-09-05.

## Core gaps to cross off

- [ ] Company and people sourcing from saved searches, Maps, and job-board
      sources.
- [x] Generic HTTP enrichment using server-configured connections, GET/JSON POST,
      row-token inputs, one-to-sixteen JSON output paths, explicit request consent,
      column-ordered execution and manual/background/scheduled runs. Verified
      against an isolated local API and D1 on 2026-09-05.
- [x] Authenticated durable inbound webhook inbox with delivery-key deduplication,
      payload conflict detection, paginated retrieval, nested field mapping,
      import preview and source provenance. Verified locally on 2026-09-05.
- [x] Saved per-source webhook field mappings, filtered inbox pages and validation
      against current destination columns. Verified on 2026-09-05.
- [x] Opt-in automatic webhook-to-table ingestion on worker ticks, atomic delivery
      completion, per-source failure pause/recovery, protected table revisions,
      nonconflicting edit merges and idle-grid refresh. Verified locally on
      2026-09-05, including concurrent saves and existing background/schedule paths.
- [ ] Provider-specific webhook signatures and trigger-to-recipe execution.
- [x] API-as-source with GET/JSON POST, query-based page/offset/cursor pagination,
      bounded requests/records, durable batches, partial-result retention, mapped
      import preview and optional stable-ID deduplication. Verified 2026-09-05.
- [ ] HTTP enrichment pagination, additional methods, connection portability,
      body-based or next-URL pagination,
      and outbound webhook workflows.
- [ ] Authenticated plan import plus governed HubSpot/Salesforce writeback
      through GTM Control Tower.
- [x] Multiple persistent tables, blank creation, duplication, selected-row copies
      with source-record links, and independently scoped history/jobs. Crossed off
      2026-09-05; verified through an isolated Worker + D1 workflow.
- [x] Cross-table unique-match lookups with exact text, normalized text and
      domain matching; one-to-four outputs, a five-row preview, match status,
      source evidence, fresh reads on each run, and manual/background/scheduled
      execution. Crossed off 2026-09-05.
- [x] Saved repeatable table transfer rules with mapped add/update modes,
      exact/text/domain keys, blank handling, duplicate review, revision-checked
      previews, source links and durable receipts. Verified 2026-09-05.
- [x] Lookup contains comparison, row counts and bounded multi-result JSON lists,
      preserving source order/blanks and legacy unique-match behavior. Verified
      through manual/background/scheduled runs on 2026-09-05.
- [ ] Arbitrary grouped reports, automatic table synchronization,
      portable workbook templates and deeper relationships.
- [ ] Event-driven workflows with triggers, branching, code steps, and actions.
- [ ] Persistent people/company profiles, deduplicated audiences, and dynamic
      segments.
- [x] Recurring observed-change comparisons for hiring, leadership and technology,
      plus a normalized external intent feed. Live news/fundraising monitors,
      broad source coverage and verified hire/promotion dates remain open.
- [ ] Public API to append rows and run selected output columns synchronously or
      asynchronously.
- [x] Bounded structural version history and restore with latest-20 retention,
      current-state preservation, background-job exclusion, and paused restored
      schedules. Crossed off 2026-09-05.
- [ ] Team collaboration and access controls, Google sign-in, and account-scoped
      workspaces, jobs, history, caches, and provider credentials.
- [x] True sequential fallback across two-to-four configured HTTP providers with
      nonempty/email-format acceptance, stop-on-success, explicit error policy,
      per-attempt receipts and weighted request limits. Verified 2026-09-05.
- [x] Hunter/Apollo email presets and verified email/phone acceptance predicates.
- [ ] Live multi-provider data-quality/cost comparison against competitors.
- [ ] Bulk function rollout and structural version migrations. Current versions
      apply explicitly to one compatible copy at a time. List-expanding
      stages and portable function export remain gaps.
- [ ] Complete standalone self-host packaging, persistence, and scheduled worker
      operation without a Pomade-hosted account or Sites service dependency.
- [ ] Real provider-credit ledger, per-step cost estimates, budgets, and usage
      reporting beyond the recent receipt snapshot.
- [ ] Reusable research agents with business context, documents, tools, model
      choice, and structured outputs.

## Useful but not required for the core

- [ ] Native email sequencing, mailboxes, reply automation, and campaign
      analytics. Pomade can remain enrichment-first and hand off to a sequencer.
- [ ] Native advertising-audience sync. This is a later distribution surface,
      not a prerequisite for a strong enrichment grid.

## Build order after this slice

User priority, 2026-09-05: make this a useful daily Clay/Bitscale competitor for
our own work before spending time on other users, signup, or public hosting.

1. Broader provider presets, live qualification and dedicated external-event signals.
2. Arbitrary group-by reports and richer formula logic.
3. Richer source pagination and native provider presets.
4. Saved-search sources, external-event monitors and bulk function rollout.
5. Continuous CRM synchronization, native associations and portable workbook export.

Defer account isolation, Google sign-in, billing and public onboarding until our
own core workflows are working well. They remain required before a public
multi-user launch, but they are not the next implementation slice.

Standalone packaging is an explicit delivery milestone before calling this
self-host-ready. Keep the current runtime while proving the next product slices;
do not build a second product or a speculative storage framework now.

## Competitive targets, refreshed 2026-09-05

These are documented capabilities, not independently measured product tests.
Provider counts and coverage percentages on marketing pages are vendor claims.

| Area | Current competitor evidence | Pomade's concrete target |
| --- | --- | --- |
| Reuse | Bitscale saves enrichment templates; Clay Functions bundle steps and propagate updates across tables. | Same-row functions with per-copy version previews and rollback now; bulk rollout and structural migrations remain gaps. |
| Data coverage | Both advertise multi-provider waterfalls. | Configured HTTP fallback now stops on success and records attempts; next compare identical real inputs for accepted data and actual cost. |
| Research | Claygent browses for dynamic context; Bitscale advertises live BitAgent research. | Preserve citations and typed outputs; measure grounded answer accuracy on the same questions. |
| Automation | Clay documents Workflows and custom signals; Bitscale documents programmatic grid execution. | Add event-driven runs with visible progress and receipts; prove retries do not duplicate successful actions. |
| Ownership | Our product requirement is hosted convenience plus independent installation. | Same recipe format and engine in both; account-independent exports and documented self-host setup. No claim about competitor self-host support. |

The current grid, receipts, bounded jobs and local recipe engine are foundations.
They do not establish competitive scale, full feature parity, or superior data.
The refreshed references below support this assessment alongside
[Clay custom signals](https://www.clay.com/signals),
[Claygent](https://university.clay.com/lessons/enriching-with-claygent), and
[Bitscale enrichment](https://bitscale.ai/solutions/lp-data-enrichment), and
[Bitscale Workbooks](https://docs.bitscale.ai/ingredients/workbooks).

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

## Lookup comparison, refreshed 2026-09-05

[Bitscale Vlookup](https://docs.bitscale.ai/ingredients/vlookup) pulls selected
fields from another grid with exact or contains matching. Clay's
[Send table data guide](https://university.clay.com/docs/send-table-data)
distinguishes pulling reference data with lookups from pushing/creating rows,
and describes lookup counting/aggregation use cases. Pomade now supports the
unique-match reference-data workflow with explicit ambiguity handling. Contains matching, row counts, value lists and repeatable table transfers are now
implemented, along with keyed sum, average, minimum and maximum rollups.
Arbitrary group-by reports and automatic synchronization remain
gaps; these features do not establish complete lookup parity.

## HTTP comparison, refreshed 2026-09-05

[Clay HTTP API integration](https://university.clay.com/docs/http-api-integration-overview)
documents arbitrary API enrichment and API sources, authentication, JSON response
mapping, more request methods and pagination. Pomade now covers bounded GET and
JSON POST enrichment with server-stored credentials. The remaining HTTP items
above are explicit gaps; this first slice does not establish full HTTP parity.

## Inbound webhook comparison, refreshed 2026-09-05

[Clay webhooks](https://university.clay.com/docs/webhook-integration-guide) add
incoming JSON records to a table immediately and support an authentication token.
Pomade now durably receives authenticated deliveries with retry deduplication and
an import preview, and now supports opt-in automatic ingestion on worker ticks. It is bounded polling,
not instant event-to-enrichment execution. Provider-specific adapters and automatic
recipe triggering remain gaps.


## Apollo company preset contract, refreshed 2026-09-05

[Apollo organization enrichment](https://docs.apollo.io/reference/organization-enrichment)
documents GET `/api/v1/organizations/enrich`, domain input and one credit per
organization. The official page's embedded response example supplies
`organization.name`, `primary_domain`, `industry` and `estimated_num_employees`.
[OpenAPI/authentication guidance](https://docs.apollo.io/reference/openapi-specification)
confirms the `x-api-key` header. Pomade withholds mismatched identities and keeps
actual credit usage unknown; local fixtures are not live account qualification.


## Numeric lookup slice, 2026-09-05

Pomade now aggregates one to four numeric fields over matching saved rows using
sum, average, minimum and maximum. Blanks are excluded; malformed values require
review. Templates preserve the modes. Focused tests and isolated Worker/D1 checks
cover manual and queued execution with fresh source data. This closes the keyed
numeric rollup gap, not general reporting or complete Clay/Bitscale parity.


## Live three-company assignment, 2026-09-05

DemandDrive/HeroDevs homework was completed locally for three existing targets
with three source-backed signals, reviewed 45/30/25 scoring, 15 buyer-role rows
and three first-party-verified named candidates. Parallel research and Apollo
company enrichment ran live. Apollo People Enrichment returned HTTP 403 because
the existing Free plan excludes that endpoint; no email was invented.

The workflow exposed two practical fixes: list JSON parsing now tolerates
appended source citations, and CRM verification handles HubSpot URL normalization.
Both CRM adapters created/read/imported three companies and three contacts,
then verified a mapped update and unchanged repeat. Salesforce account links
were read back. The initial research needed corrected targeting prompts, fresh
source excerpts and human score review; this does not establish autonomous
research accuracy or Clay-level integration breadth. Native receipts and the
private assignment report remain in ignored `outputs/demanddrive`.
