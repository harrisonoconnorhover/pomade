# Clay contact-provider tracker for Pomade

Checked **2026-09-07** against Clay's public integration directory, individual
provider/action pages, waterfall documentation, and the direct LeadMagic API docs.
This is a development backlog, not a claim that we have bought or connected these
services. No accounts were created and no paid or live enrichment calls were made.

Clay waterfalls are configurable: users can change the order, add/remove steps,
and choose validation rules. There is no single provider sequence that every Clay
user runs. The lists below identify documented integrations, not a verified export
of the current default waterfall in Harrison's account. The signed-in Chrome
workbook was located; the enrichment configuration was not changed or run.

Sources: [Clay waterfalls](https://university.clay.com/docs/building-a-data-waterfall),
[current integration directory](https://www.clay.com/integrations),
[waterfall marketing page](https://www.clay.com/waterfall-enrichment).
The broad “150+/200+ providers” claims include far more than phone/email suppliers.

## Finding emails and phone numbers

“Phone” means the public action does not itself establish a mobile-only result.
An em dash means this review did not establish that capability through the listed
Clay action; it is not a claim about everything the vendor sells. Provider links
lead to the current actions supporting each row.

| Service / Clay source | Email lookup | Phone lookup | Pomade status / next gap |
|---|---|---|---|
| [Apollo.io](https://www.clay.com/integrations/data-provider/apollo-io) | Work; personal | Mobile; company | Email preset exists. Phone reveal/callback support remains a gap. |
| [Hunter](https://www.clay.com/integrations/data-provider/hunter) | Work | — | Email finder preset exists; standalone verification preset remains a gap. |
| [Prospeo](https://www.clay.com/integrations/data-provider/prospeo) | Work | Mobile | Email and verified-mobile presets exist; mobile entitlement still needs a live check. |
| [People Data Labs](https://www.clay.com/integrations/data-provider/people-data-labs) | Work*; personal | Mobile | Company adapter exists; person/email/mobile presets remain a gap. |
| [LeadMagic](https://www.clay.com/integrations/data-provider/leadmagic) | Work; personal | Mobile | NEW: work-email and mobile-by-work-email presets; fixture-tested, no live key/test. |
| [Findymail](https://www.clay.com/integrations/data-provider/findymail) | Work | Mobile | Email lookup, US phone lookup and independent email verification implemented and fixture-tested. Finder outputs use format-only acceptance; the verifier requires `verified=true`. No live account test. |
| [Enrow](https://www.clay.com/integrations/data-provider/enrow) | Work | Mobile | Planned. Includes a separate email validation action in Clay. |
| [Dropcontact](https://www.clay.com/integrations/data-provider/dropcontact) | Work | — | Planned. Confirm current direct API request/result lifecycle before wiring. |
| [Icypeas](https://www.clay.com/integrations/data-provider/icypeas) | Work | — | Planned. Includes email verification and domain email discovery. |
| [Datagma](https://www.clay.com/integrations/data-provider/datagma) | Work | Mobile | Planned. Clay phone lookup accepts profile or email identifiers. |
| [Wiza](https://www.clay.com/integrations/data-provider/wiza) | Work; personal | Phone | Planned. Verify direct API result retrieval and phone types. |
| [Forager](https://www.clay.com/integrations/data-provider/forager) | Personal | Mobile | Planned. Public Clay actions show phone and personal email, not work-email discovery. |
| [ContactOut](https://www.clay.com/integrations/data-provider/contactout) | Personal | Mobile | Planned. Current listed lookup actions use professional profile URLs. |
| [FullEnrich](https://www.clay.com/integrations/data-provider/fullenrich) | Work | Mobile | Planned. Direct enrichment is asynchronous; requires result correlation and callback handling. |
| [BetterContact](https://www.clay.com/integrations/data-provider/bettercontact) | Work | Mobile | Planned. Confirm direct API contracts and result retrieval. |
| [Upcell](https://www.clay.com/integrations/data-provider/upcell) | — | Mobile | Planned. Confirm direct account/API availability. |
| [Firmable](https://www.clay.com/integrations/data-provider/firmable) | Work; personal | Mobile | Planned. Clay actions explicitly target Australia. |
| [RocketReach](https://www.clay.com/integrations/data-provider/rocketreach) | Work; personal | Phone | Planned. Confirm direct API entitlements and phone type/status fields. |
| [SMARTe](https://www.clay.com/integrations/data-provider/smarte) | Work | Mobile; business | Planned. Clay work-email action is listed as Clay Credits Only; direct access needs separate verification. |
| [ZoomInfo](https://www.clay.com/integrations/data-provider/zoominfo) | Work | Mobile | Planned. Clay contact action requires the user’s own account. |
| [Bytemine](https://www.clay.com/integrations/data-provider/bytemine) | Work; personal | Mobile; direct dial | Planned. Current contact-info action lists these outputs. |

*People Data Labs is named for work email on Clay's waterfall page; the current
[person action](https://www.clay.com/integrations/action/enrich-person-people-data-labs)
explicitly lists personal email and mobile outputs. Confirm work-email field
availability when implementing the person adapter. Pomade's existing PDL company
connection is not person enrichment.

Useful action-level checks: [Apollo](https://www.clay.com/integrations/action/enrich-person-apollo-io),
[Bytemine](https://www.clay.com/integrations/action/find-contact-info-bytemine),
[ZoomInfo](https://www.clay.com/integrations/action/enrich-contact-zoominfo),
[SMARTe email](https://www.clay.com/integrations/action/find-work-email-smarte),
[LeadMagic email](https://www.clay.com/integrations/action/find-work-email-leadmagic).

## Verification is a separate capability

A found address/number and a verified address/number are different outcomes.
Verification can test deliverability, line type, activity or association with a
person; those are not interchangeable. Most of these need separate adapters in
Pomade. Current verified-email presets inspect the lookup provider's own status.

| Service / Clay source | Documented role | Pomade gap |
|---|---|---|
| [ZeroBounce](https://university.clay.com/docs/zerobounce-integration-overview) | Email validation; named as the default in Clay University | Independent verifier preset implemented; accepts `status=valid`. Fixture-tested, live access pending. |
| [BounceBan](https://www.clay.com/integrations/data-provider/bounceban) | Email verification | Verifier adapter |
| [Debounce](https://www.clay.com/integrations/data-provider/debounce) | Email validation | Verifier adapter |
| [Enrichley](https://www.clay.com/integrations/data-provider/enrichley) | Email validation | Verifier adapter |
| [Hunter](https://www.clay.com/integrations/data-provider/hunter) | Email validation in addition to discovery | Standalone verification preset |
| [Findymail](https://www.clay.com/integrations/data-provider/findymail) | Email validation in addition to discovery | Findymail finder and verifier presets implemented; fixture-tested, live access pending. |
| [Enrow](https://www.clay.com/integrations/data-provider/enrow) | Work-email validation | Finder plus verifier adapters |
| [Icypeas](https://www.clay.com/integrations/data-provider/icypeas) | Email verification | Finder plus verifier adapters |
| [LeadMagic](https://www.clay.com/integrations/data-provider/leadmagic) | Email validation in addition to discovery | Standalone verifier; new finder checks its own returned status only |
| [Trestle](https://www.clay.com/integrations/data-provider/trestle) | Phone validation and contact verification | Phone line/identity verification adapter |
| [SureConnect](https://www.clay.com/integrations/data-provider/sureconnect) | Phone verification | Phone quality/connection validation adapter |
| [ClearoutPhone](https://www.clay.com/integrations/data-provider/clearoutphone) | Phone line type and status | Phone type/status adapter |

Clay University names [ZeroBounce as its default email validator](https://university.clay.com/lessons/enrich-people-waterfalls-clay-101)
and documents configurable catch-all handling. This is a documentation claim,
not an observation of the validator selected in Harrison's current table.
Its [phone verification example](https://university.clay.com/claybooks/find-verified-phone-numbers-likely-to-answer-with-only-an-email)
uses Trestle and SureConnect after the mobile lookup waterfall.

## Related or uncertain entries to keep on the list

| Service / source | What was established | Next check |
|---|---|---|
| [Lusha](https://www.clay.com/integrations/data-provider/lusha) | Current person enrichment integration; also named for email on the waterfall marketing page | Current action output list does not explicitly expose email/mobile; verify the applicable contact action/API before claiming support. |
| [LeadIQ](https://www.clay.com/integrations/data-provider/leadiq) | Current person enrichment action, bring-your-own account | Published output list is profile data; verify email/mobile outputs and permissions. |
| [Data Legion](https://www.clay.com/integrations/data-provider/data-legion) | Current person enrichment action | Output list is too sparse to count as verified phone/email discovery. |
| [SignalHire](https://www.clay.com/integrations/data-provider/signalhire) | Provider listed in the current directory | No specific phone/email action captured in its public provider page; recheck. |
| [Mixrank](https://www.clay.com/integrations/data-provider/mixrank) | Personal-email lookup and hashed-email actions | Separate personal-email use case; no Pomade adapter. |
| [Limadata](https://www.clay.com/integrations/data-provider/limadata) | Personal-email and hashed-email actions | Separate personal-email use case; no Pomade adapter. |
| [Contactlevel](https://www.clay.com/integrations/data-provider/contactlevel) | Hashed-email action | Audience matching; a hash is not a contactable email address. |
| [Versium](https://www.clay.com/integrations/data-provider/versium) | Contact points / hashed identifiers for advertising audiences | Audience use case; verify any plain contact-data product separately. |
| [Catch-all Verifier](https://www.clay.com/integrations/data-provider/catch-all-verifier) | Listed in the current directory | No specific action captured; verify the exact service/API. |
| [Emailable](https://www.clay.com/integrations/data-provider/emailable) | Listed in the current directory | No specific action captured; verify its Clay validation action before counting it. |

Clay's [waterfall marketing page](https://www.clay.com/waterfall-enrichment) also
names **Nimbler**, **Snov**, **Selligence**, and **Retention.com**. These names were
not found in the current public integration directory during this check. Keep
them as “recheck availability,” not as proven current default steps or confirmed
retirements. Marketing pages and the integration catalog do not completely agree.

## What we can build without accounts

We can implement documented request mapping, server-side authentication, response
parsing, status handling, sequential fallback and stop rules, configuration UI,
portable templates, and synthetic-response tests. That work needs API documentation,
not a working key. An account/key is needed to confirm entitlement, actual response
shape, rate limits, credit use and extra matches on our contacts. No code can supply
the vendor's private dataset without authorized access.

Clay's access agreement does not automatically grant Pomade API access. Some actions
require a separate provider account even inside Clay (for example ZoomInfo and
LeadIQ); others can be bought through Clay credits. Each direct API must be checked
separately. A dashboard's free credits do not by themselves prove API entitlement.

Do not fill the UI with pretend working connectors. Keep documentation-only entries
in this tracker until there is a concrete adapter. Label fixture-tested adapters
as awaiting a live account check, and never run missing-key providers.

## First implementation: LeadMagic

**Implemented, fixture-tested, not live-validated.**

- Work email: `POST /v1/people/email-finder`, name + company domain, accept only
  `status=valid`. Unknown, catch-all and missing results advance to the next step.
- Mobile: `POST /v1/people/mobile-finder`, mapped work-email input, return a
  country-coded number using **phone format only** acceptance. The documented
  response has no verification/ownership flag; strict verified-phone mode refuses
  this preset. Independent verification remains separate work.
- Authentication: server-side `X-API-Key` via `LEADMAGIC_API_KEY`. Hosted users can
  save their own key in **Account → LeadMagic**; local users set it in ignored
  `.env.local` and rebuild/restart. Other accounts never inherit the owner's key.
- In **Provider waterfall → Quick setup**, presets remain disabled until a key
  and the relevant input columns are available. Adding a waterfall does not run it.
- HTTP 403/429 stop the default chain. Generic usage receipts still report unknown
  provider cost; do not interpret “unknown” as free or quote a bill from test data.

Direct sources: [current email API](https://leadmagic.io/docs/api-reference/email-finder),
[current mobile API](https://leadmagic.io/docs/api-reference/mobile-finder).
Use the current `/v1/people/…` routes; the older `docs.leadmagic.io` examples show
unversioned routes and different status descriptions. No new key or plan purchased.

## Next development order

1. Add an independent email verifier and a phone type/status/identity verifier;
   ZeroBounce/Hunter and Trestle/ClearoutPhone/SureConnect are documented candidates.
2. Add another direct email/mobile finder, starting with Findymail or Enrow after
   reviewing the current direct API. Judge it by additional acceptable matches
   after the providers we already have, not total database size claims.
3. Add durable asynchronous provider-result handling. Pomade's current generic
   waterfall expects each step to finish in one HTTP response. For example,
   [FullEnrich's enrichment API delivers results later](https://docs.fullenrich.com/api/v2/general/webhooks);
   a simple endpoint preset is insufficient. Apollo phone callbacks remain a gap.
4. Revisit the current **one-to-four provider-step** limit only when a tested
   waterfall needs more steps. Do not equate a provider inventory with usable
   coverage or spend time registering every service before testing incremental value.

### Findymail (September 7, 2026)

Added name/domain email discovery, professional-profile US phone lookup, and an independent email-verifier preset using the [official API reference](https://app.findymail.com/docs/). Finder responses do not contain an explicit verification status. The phone endpoint documents US coverage and can return landlines. These lookup presets therefore check format only; the separate verifier requires the returned boolean `verified=true`. HTTP-200 error bodies stop the chain instead of masquerading as no-match results. API-key setup is available per account or through `FINDYMAIL_API_KEY`; no real credential or vendor call was used to develop this adapter.

All preset setups can now be saved before connecting keys. Missing connections stop their step at execution; they are never silently skipped. Portable templates keep input mappings and omit credentials.

### Independent email verification (September 7, 2026)

[Hunter](https://hunter.io/api-documentation#email-verifier) and [LeadMagic](https://leadmagic.io/docs/api-reference/email-validation) now have separate existing-email verification presets. [ZeroBounce](https://www.zerobounce.net/docs/email-validation-api-quickstart/v2-validate-emails) has a server-side connection and `valid`-only verifier. ZeroBounce query authentication is attached on the server and excluded from public connection summaries and portable recipes. Optional activity data and Verify+ add-ons are explicitly off. Hunter's HTTP 202 pending and 222 incomplete-check responses stop by default for a later manual retry instead of consuming another provider. This slice does not add automatic asynchronous polling. All new verifiers were tested with synthetic responses; live account access remains unverified.

### Trestle phone validation (September 7, 2026)

Added a preset for the [Phone Validation API](https://docs.trestleiq.com/api-reference/phone-validation-api), using `is_valid=true` and matching the returned number to the submitted international number. National-format responses are accepted only when the returned calling code reconstructs that same number. No country guessing, owner lookup, activity threshold, or paid add-ons. An invalid, ambiguous or incomplete response remains reviewable. Basic malformed emails and country-code-less phones are rejected locally before verifier calls. Fixture tests cover validity, national formatting, mismatches and partial errors; live access is pending.

### People Data Labs person fields (September 7, 2026)

Added separate work-email, recommended-personal-email and mobile presets from the [Person Enrichment API](https://docs.peopledatalabs.com/docs/reference-person-enrichment-api). Each requests only its target field, requires that field to exist and requests at least 6/10 identity-match likelihood. The score is not contact verification. Documented 404 misses fall through; low-confidence or masked boolean outputs stop for review. [Restricted field bundles](https://docs.peopledatalabs.com/docs/person-data-field-bundles) can return availability flags instead of usable contact data, so API access alone is insufficient. Existing `PDL_API_KEY` config serves both company and person presets. Synthetic contract tests only; live contact-field access remains pending.

### ContactOut (September 7, 2026)

Added work-email, personal-email and phone presets from the [Contact Info API](https://api.contactout.com/#contact-info-api-single). Work lookups require the `Verified` status for that exact address in the vendor dictionary. Phone requests set `email_type=none`; email requests set `include_phone=false`. Personal email and phone are explicitly format-only. A documented 404 is a miss; account errors stop by default. Sales Navigator/Recruiter inputs are rejected before a call. Synthetic tests cover mixed verification states, separate reveal controls, no-match and mismatched profiles; live access pending.
