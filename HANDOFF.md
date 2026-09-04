# Morning Handoff

## Finished

- Polished the Glide workspace with row selection, grouped recipes, scoped runs, quality signals, and run history.
- Added preview-first, read-only HubSpot contact and Salesforce lead imports with append/replace behavior.
- Kept Apollo as an explicit selected-row enrichment with safer 403 diagnostics and credit-aware caching.
- Added a downloadable GTM Control Tower preview plan; Pomade cannot write to either CRM.
- Added private-site social metadata and a Pomade-branded sharing card.

## Try It

Run `npm run dev`, open **Sources** to preview/import a CRM, select rows, add a recipe, and click **Run selected**. Use **Action → Prepare CRM handoff** to download the non-executable Control Tower plan.

## Checks

- `npm test`: 20 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed for Pomade source.
- `npm run build`: production build passed.
- Live read-only preview: 14 HubSpot contacts and 20 Salesforce leads returned; no CRM writes were made.

## Decisions

- CRM providers are preview-first sources; provider IDs make append imports idempotent.
- Selected rows define run scope, otherwise the visible filtered rows run.
- GTM Control Tower remains the only future CRM mutation boundary.

## Remaining

- Authorize copying the test CRM credentials into the owner-only Site environment; local previews are verified.
- Replace the test Salesforce bearer token with durable OAuth before broader use.
- Add Apollo phone reveal behind a public authenticated webhook and explicit credit preview.
- Add the receiving preview endpoint inside GTM Control Tower.
- Connect the adapter to a packaged Scoutbound release.

## Review First

- `components/pomade-workspace.tsx` for the complete user flow.
- `lib/crm-sources.ts` and `lib/crm-import.ts` for the read-only import boundary.
- `lib/control-tower-adapter.ts` and `lib/apollo-client.ts` for outbound safety.
