# Requested Pomade workflows

Acceptance checklist from Harrison's 2026-09-05 request. This scope remains active.
Implemented code, passing fixtures and live provider access are separate claims.

| Requirement | Available locally now | Remaining to reach the request |
|---|---|---|
| Sequential verified email/phone fallback | Provider order, status + format checks, stop at first valid result; Hunter/Apollo email presets; verified-phone configuration | Real Hunter/phone credentials; live multi-provider match coverage. Existing Apollo People access returned 403. |
| Firmographics/technographics | Apollo size, numeric/display revenue, location and technology lists live for all 3 companies; funding for 2; PDL adapter | PDL key and broader coverage; Solera funding absent. Provider technology observations do not prove install dates. |
| Hiring trends/open roles | Repeatable focused research, source-linked baselines, scheduled set comparisons; direct Workday/ATS availability checks | Broader career-site support and research relevance. Live check rejected an expired job; a current but off-focus role was manually excluded. No qualifying RevOps hiring claim is retained. |
| Leadership changes | Current-team research preset, named-person title comparisons, first-observed additions, source links | Consistent automated coverage and explicit hire/promotion evidence. Final 3-company roster was manually checked; raw AI misses/unsupported dates remain in receipts. |
| Technology additions/removals | Case/order-independent set comparisons and first-observed/no-longer-reported events; real Apollo baselines | Repeat longitudinal collection; no claim of an actual install/removal date. |
| Website/G2/LinkedIn intent | Authenticated, idempotent normalized account feed; separate event/ingestion times; latest-event and tag fields for recipes/CRM | Real visitor/G2/LinkedIn source accounts and provider-specific delivery setup. Only clearly labeled fixtures tested these event types. |
| Custom account research / extraction | Parallel/Gemini BYOK, custom questions, typed JSON schema and citations; invalid structured results cannot populate qualification fields | Factual accuracy still requires source review; more extraction evaluation. A valid JSON shape does not prove a claim. |
| Conditional cost controls | Numeric AND/OR rules, sequential fallback, cache and bounded requests; conditions before each provider step; signal-based gates | Broader provider spending telemetry and coverage tests as accounts are connected. |
| CRM enriched fields, tags and scores | Native field discovery, typed writes/reads/imports; HubSpot firmographics and both-CRM numeric revenue round trips live | Salesforce custom-field access approval; HubSpot schema permission/sign-in; live custom score/tag values. |
| Automated CRM workflows/routing/sequences | Saved mappings captured by one-time/daily/weekly schedules, qualification, verified receipts and duplicate protection; 3 real accounts updated in each CRM | Native CRM workflow/owner/sequence configuration and entitlement checks. No sequence enrollment, rep routing or prospect messaging has been tested. |

Use **DemandDrive — 3 ICP accounts** for reviewed research, **DemandDrive — CRM
automation** for the verified scheduled write example, and **Signals — local
acceptance fixture** for synthetic intent-to-formula testing. Setup and limits:
[signals and scheduled CRM](signals-and-crm.md), [provider choices](enrichment-providers.md).

The automation acceptance run completed once and is now stopped. Local recurring
runs need the local server plus `npm run clock -- 8798`. No public publishing or
outreach occurred. Authorized credits remain Parallel/Apollo Free tiers; new paid
services, upgrades or subscriptions need an approved budget.
