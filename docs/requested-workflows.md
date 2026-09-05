# Requested Pomade workflows

Acceptance checklist from Harrison's 2026-09-05 request. Keep this scope active
until the implemented workflows pass local tests and the available providers/dev
CRMs pass live checks. Account/plan access is distinct from implemented code.

| Requirement | Current evidence | Work remaining |
|---|---|---|
| Sequential verified email/phone fallback | Verified email/phone status + format fallback tested; Hunter/Apollo email presets; Hunter test API contract passed | Real Hunter/phone-provider credentials and live multi-provider coverage |
| Firmographics/technographics | Apollo size/revenue/location/technologies live for all 3 companies; funding for 2; PDL company adapter tested | PDL key, broader live coverage; Solera funding absent |
| Hiring trends/open roles | Ad hoc cited Parallel research | Reusable job sources, scheduled comparisons and account feed |
| Leadership changes | Ad hoc public people research | Repeated snapshots and first-observed hire/promotion events |
| Technology additions/removals | Generic field-change feed | Technology source and set-difference events with observation dates |
| Website/G2/LinkedIn intent | Generic authenticated webhook inbox | Normalized account feed, explicit source adapters and source access |
| Custom account research and structured extraction | Parallel/Gemini BYOK, citations, typed outputs live | Extraction reliability, additional configurable model endpoint and evaluation cases |
| Conditional cost controls | Numeric AND/OR qualification, cache, request bounds; focused pipeline test skips 3 of 4 rows | Live enrichment examples and future budget controls |
| CRM enriched fields, signal tags and scores | Native field discovery, typed custom writes/reads/imports implemented; 30 tests; HubSpot firmographics round trip live | Salesforce field access approval; HubSpot schema permission/sign-in; live custom score/tag writes |
| Automated CRM workflows/routing/sequences | Manual confirmed CRM writes and local scheduled recipes | Captured recurring write configuration, native automation triggers and configured sequence destinations |

Build in dependency order: compound qualification → verified waterfalls and
provider data → source-backed signal feed → typed CRM automation. Use the three
DemandDrive companies as the continuing real-data example. Preserve raw source
and native CRM receipts privately; do not claim provider access or production
maturity from fixtures. Do not send outreach to real prospects during tests.

Existing authorized credits: Parallel and Apollo Free tiers. Existing HubSpot
and Salesforce accounts are dev accounts authorized for real testing writes.
New paid services, upgrades or subscriptions require a specific approved budget.
