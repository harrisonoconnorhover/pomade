# Enrichment providers

For the current Clay comparison and provider backlog, see
[the contact-provider tracker](clay-contact-provider-tracker.md), checked September 7, 2026.
LeadMagic work-email/mobile adapters are now fixture-tested; a live key and account
check are still needed. The September 5 results below remain historical observations.

Checked 2026-09-05. Start with existing Apollo for company data and Parallel for
public-source research. Codex subscription research is now another local option;
Hunter and Prospeo free accounts are connected for verified work email. Provider fields are observations/estimates,
not independent proof that every reported technology is still installed.

| Provider | Pomade setup | Access and evidence |
|---|---|---|
| Apollo | Existing `APOLLO_API_KEY`; company preset and verified-email waterfall step | Eight company requests this iteration (3 initial, 2 after fixing long technology lists, 3 for numeric revenue). All three matched; Solera funding missing. Current account's People Enrichment previously returned 403. |
| Hunter | `HUNTER_API_KEY`; waterfall → Quick setup → Hunter | Finder uses full name + domain and accepts only `data.verification.status=valid`. Catch-all and unknown fall through. Free account created and email verified. Real `/v2/account` returned HTTP 200 with 50 credits before enrichment testing. |
| Prospeo | `PROSPEO_API_KEY`; waterfall → Quick setup → Prospeo | Free Google-sign-in account created; real account API returned FREE with 100 credits before testing. Preset uses full name + company website, requests only verified email and disables mobile reveal. |
| People Data Labs | `PDL_API_KEY`; company preset | Company adapter maps size, employees, industry, revenue band, location and funding. Unit-tested; no live key. Google signup rejected Gmail with a business-email requirement; waiting for Harrison's existing domain email. Actual free account entitlements remain unverified. |
| Phone provider | Existing custom HTTP connection + verified-phone acceptance | Require a country-coded number and an explicit verification status. No live verified-phone provider connected. Apollo phone reveal is asynchronous and requires a reachable HTTPS webhook; do not treat the synchronous response as a phone result. |
| Wappalyzer | Optional later | API requires a Business plan; free dashboard lookups do not establish free API access. No subscription purchased. |

Keys belong in ignored `.env.local`; restart/rebuild the local server after adding
one. Never put keys into row cells, request paths or portable recipes. The detailed Apollo preset keeps the printed revenue estimate and numeric annual
revenue separate; only the numeric field should map to a CRM number property.
Numeric AND/OR gates run before provider requests. Prospeo requests pause 3.1 seconds before sending to respect its free-tier
limits in sequential runs; concurrent independent runs can still be rate-limited.
Its documented NO_MATCH response advances the waterfall without enabling general
error continuation. Presets retain provider/status columns
and per-attempt receipts. Generic format-only modes remain explicitly labeled.
Structured arrays can hold 20,000 characters; oversized values are flagged rather
than silently truncated. Other HTTP text outputs retain their 4,000-character cap.

Sources: [Apollo organization enrichment](https://docs.apollo.io/reference/organization-enrichment),
[Apollo people enrichment](https://docs.apollo.io/reference/people-enrichment),
[Hunter API](https://hunter.io/api-documentation),
[Prospeo person enrichment](https://prospeo.io/api-docs/enrich-person),
[PDL company enrichment](https://docs.peopledatalabs.com/docs/reference-company-enrichment-api),
[PDL schema](https://docs.peopledatalabs.com/docs/company-schema),
[Wappalyzer API](https://www.wappalyzer.com/docs/api/v2/lookup/).

Provider catalog discovery used `stripe projects search "company enrichment email
verification" --json` (irrelevant services) and `stripe projects search Hunter
--json` (no results). Directory searches were `"email verification API"` with
`--mpp-supported` (no results) and `"company data enrichment API"` (Algolia, not a
suitable company data source). Official provider documentation supplied the
recommendations. The initial catalog checks created no accounts. Later, explicitly authorized free Hunter and Prospeo accounts were created directly; no paid plan, subscription upgrade or payment was added.

For optional ChatGPT-subscription research, see [local Codex setup](codex-research.md).

Live test: the three existing buyer contacts went through Prospeo → Hunter.
Prospeo found one verified work email (Clearwater Security). HealthEdge had no
verified result; Solera's Hunter response was accept-all and was withheld.
The follow-up after adding pacing and NO_MATCH handling completed without
technical errors. This establishes working fallback, not universal coverage.
Private results and current balances are in `outputs/codex-and-free-enrichment.json`
and `outputs/provider-credit-balances.json`.

## Small-budget testing priorities

Pricing checked September 5, 2026 against the providers' own pages. This is a
recommendation, not a purchase or a claim that a new phone adapter is connected.

| Priority | Provider | Practical test budget | Why use it next |
|---|---|---|---|
| Keep | Hunter | Free: 50 credits/month. One found email costs 1 credit; verification costs 0.5. | Existing email fallback plus independent verification of imported emails. |
| Extend next | Prospeo | Free: 100 credits/month; mobile enrichment costs 10 credits/result, including email. Free API access is limited. | We already have a working email connection. Check the account's mobile endpoint entitlement before spending on another plan. Phone access has not been live-verified. |
| First new paid provider | LeadMagic | Basic: $49.99/month for 2,000 credits. Email: 1; mobile: 5; email validation: 0.25. Full enrichment API included. | Adds an independent mobile source and email verifier. If spent entirely on successful mobiles, the allowance covers up to 400; email lookups share that balance. |
| Later | Dropcontact | Starter listed at €79/month; 50-credit trial offered. | Useful for another email source, but less valuable than filling our mobile gap first. |

With less than $25/month available, use the existing free accounts first. Around
$50/month, test one month of LeadMagic and measure its additional matches before
adding a second paid subscription. Match rates and number ownership still need
measurement on our records; a vendor's verified label is not proof of delivery or
a successful call. No paid plan was purchased in this update.

Use a fixed set of 20–30 known business contacts and track, per provider: verified
emails, mobiles versus office numbers, additional matches after earlier providers
missed, provider errors, credits consumed, and cost per additional valid result.
Keep no-match, catch-all, invalid, rate-limited and missing-access outcomes separate.

Sources: [Hunter pricing](https://hunter.io/pricing),
[Prospeo plans](https://help.prospeo.io/en/article/plans-and-pricing-overview-cdloq9/),
[Prospeo credit costs](https://help.prospeo.io/en/article/how-prospeo-credits-work-yso5gk/),
[LeadMagic pricing](https://leadmagic.io/pricing),
[Dropcontact pricing](https://www.dropcontact.com/es/precios).
Stripe Directory discovery used `"contact enrichment API"` and
`"email verification"`, without filters. The completed email-verification search
returned no matches; recommendations above use the official provider sources.
