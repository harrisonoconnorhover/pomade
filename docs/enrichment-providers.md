# Enrichment providers

Checked 2026-09-05. Start with existing Apollo for company data and Parallel for
public-source research. Add Hunter for verified work email, then PDL if company
coverage warrants a second source. Provider fields are observations/estimates,
not independent proof that every reported technology is still installed.

| Provider | Pomade setup | Access and evidence |
|---|---|---|
| Apollo | Existing `APOLLO_API_KEY`; company preset and verified-email waterfall step | Five company requests this iteration (3 initial + 2 after fixing long technology lists). All three matched; Solera funding missing. Current account's People Enrichment previously returned 403. |
| Hunter | `HUNTER_API_KEY`; waterfall → Quick setup → Hunter | Finder uses full name + domain and accepts only `data.verification.status=valid`. Catch-all and unknown fall through. Public `test-api-key` contract returned HTTP 200; no real account connected. |
| People Data Labs | `PDL_API_KEY`; company preset | Company adapter maps size, employees, industry, revenue band, location and funding. Unit-tested; no live key. Free Company Enrichment access is advertised but actual account entitlements must be checked. |
| Phone provider | Existing custom HTTP connection + verified-phone acceptance | Require a country-coded number and an explicit verification status. No live verified-phone provider connected. Apollo phone reveal is asynchronous and requires a reachable HTTPS webhook; do not treat the synchronous response as a phone result. |
| Wappalyzer | Optional later | API requires a Business plan; free dashboard lookups do not establish free API access. No subscription purchased. |

Keys belong in ignored `.env.local`; restart/rebuild the local server after adding
one. Never put keys into row cells, request paths or portable recipes. Numeric
AND/OR gates run before provider requests. Presets retain provider/status columns
and per-attempt receipts. Generic format-only modes remain explicitly labeled.
Structured arrays can hold 20,000 characters; oversized values are flagged rather
than silently truncated. Other HTTP text outputs retain their 4,000-character cap.

Sources: [Apollo organization enrichment](https://docs.apollo.io/reference/organization-enrichment),
[Apollo people enrichment](https://docs.apollo.io/reference/people-enrichment),
[Hunter API](https://hunter.io/api-documentation),
[PDL company enrichment](https://docs.peopledatalabs.com/docs/reference-company-enrichment-api),
[PDL schema](https://docs.peopledatalabs.com/docs/company-schema),
[Wappalyzer API](https://www.wappalyzer.com/docs/api/v2/lookup/).

Provider catalog discovery used `stripe projects search "company enrichment email
verification" --json` (irrelevant services) and `stripe projects search Hunter
--json` (no results). Directory searches were `"email verification API"` with
`--mpp-supported` (no results) and `"company data enrichment API"` (Algolia, not a
suitable company data source). Official provider documentation supplied the
recommendations. No provider account, subscription or payment was created.
