# Requested Pomade workflows

Acceptance checklist from Harrison's 2026-09-05 request. Keep this scope active
until the implemented workflows pass local tests and the available providers/dev
CRMs pass live checks. Account/plan access is distinct from implemented code.

| Requirement | Current evidence | Work remaining |
|---|---|---|
| Sequential verified email/phone fallback | Generic 2–4-provider HTTP fallback; only format/nonempty acceptance | Verification status, phone handling, real provider presets and live multi-provider checks |
| Firmographics/technographics | Apollo company identity, industry, employee count live | Revenue, location, funding history, technologies and coverage evidence |
| Hiring trends/open roles | Ad hoc cited Parallel research | Reusable job sources, scheduled comparisons and account feed |
| Leadership changes | Ad hoc public people research | Repeated snapshots and first-observed hire/promotion events |
| Technology additions/removals | Generic field-change feed | Technology source and set-difference events with observation dates |
| Website/G2/LinkedIn intent | Generic authenticated webhook inbox | Normalized account feed, explicit source adapters and source access |
| Custom account research and structured extraction | Parallel/Gemini BYOK, citations, typed outputs live | Extraction reliability, additional configurable model endpoint and evaluation cases |
| Conditional cost controls | Numeric AND/OR qualification, cache, request bounds; focused pipeline test skips 3 of 4 rows | Live enrichment examples and future budget controls |
| CRM enriched fields, signal tags and scores | Standard-field reads/writes live in both dev CRMs | Custom property/field discovery, typed writes and signal/score round trips |
| Automated CRM workflows/routing/sequences | Manual confirmed CRM writes and local scheduled recipes | Captured recurring write configuration, native automation triggers and configured sequence destinations |

Build in dependency order: compound qualification → verified waterfalls and
provider data → source-backed signal feed → typed CRM automation. Use the three
DemandDrive companies as the continuing real-data example. Preserve raw source
and native CRM receipts privately; do not claim provider access or production
maturity from fixtures. Do not send outreach to real prospects during tests.

Existing authorized credits: Parallel and Apollo Free tiers. Existing HubSpot
and Salesforce accounts are dev accounts authorized for real testing writes.
New paid services, upgrades or subscriptions require a specific approved budget.
