# Requested Pomade workflows

Acceptance checklist from Harrison's 2026-09-05 request. This scope remains active.
Implemented code, passing fixtures and live provider access are separate claims.

| Requirement | Available locally now | Remaining to reach the request |
|---|---|---|
| Sequential verified email/phone fallback | Provider order, status + format checks, stop at first valid result; Hunter/Prospeo/Apollo email presets; verified-phone configuration | Live 3-contact fallback found 1 verified email and retained 2 review results. Verified-phone reveal and broader match coverage remain. Existing Apollo People access returned 403. |
| Firmographics/technographics | Apollo size, numeric/display revenue, location and technology lists live for all 3 companies; funding for 2; PDL adapter | PDL key and broader coverage; Solera funding absent. Provider technology observations do not prove install dates. |
| Hiring trends/open roles | Repeatable focused research, source-linked baselines, scheduled set comparisons; direct Workday/ATS availability checks | Broader career-site support and research relevance. Live check rejected an expired job; a current but off-focus role was manually excluded. No qualifying RevOps hiring claim is retained. |
| Leadership changes | Current-team research preset, named-person title comparisons, first-observed additions, source links | Consistent automated coverage and explicit hire/promotion evidence. Final 3-company roster was manually checked; raw AI misses/unsupported dates remain in receipts. |
| Technology additions/removals | Case/order-independent set comparisons and first-observed/no-longer-reported events; real Apollo baselines | Repeat longitudinal collection; no claim of an actual install/removal date. |
| Website/G2/LinkedIn intent | Authenticated, idempotent normalized account feed; separate event/ingestion times; latest-event and tag fields for recipes/CRM | Real visitor/G2/LinkedIn source accounts and provider-specific delivery setup. Only clearly labeled fixtures tested these event types. |
| Custom account research / extraction | Codex ChatGPT-subscription research plus Parallel/Gemini BYOK, custom questions, typed JSON schema and citations; invalid structured results cannot populate qualification fields | Factual accuracy still requires source review; more extraction evaluation. A valid JSON shape does not prove a claim. |
| Conditional cost controls | Numeric AND/OR rules, sequential fallback, cache and bounded requests; conditions before each provider step; signal-based gates | Broader provider spending telemetry and coverage tests as accounts are connected. |
| CRM enriched fields, tags and scores | Native field discovery, typed writes/reads/imports; live firmographics plus reviewed ICP scores, tiers and tags for all 3 companies in both CRMs; persisted imports and unchanged repeat previews | This three-company workflow is verified. Broader native schemas remain untested. |
| Automated CRM workflows/routing/sequences | Saved mappings captured by one-time/daily/weekly schedules, qualification, verified receipts and duplicate protection; 3 real accounts updated in each CRM; score/tier/tag mappings also passed a scheduled unchanged check | Native CRM workflow/owner/sequence configuration and entitlement checks. No sequence enrollment, rep routing or prospect messaging has been tested. |

Use **DemandDrive — 3 ICP accounts** for reviewed research, **DemandDrive — CRM
automation** for the verified scheduled write example, and **Signals — local
acceptance fixture** for synthetic intent-to-formula testing. Setup and limits:
[signals and scheduled CRM](signals-and-crm.md), [provider choices](enrichment-providers.md), [Codex subscription research](codex-research.md).

The automation acceptance run completed once and is now stopped. Local recurring
runs need the local server plus `npm run clock -- 8798`. No public publishing or
outreach occurred. Authorized local execution now includes the connected Hunter/Prospeo Free tiers and the signed-in Codex subscription alongside Parallel/Apollo; new paid
services, upgrades or subscriptions need an approved budget.
