# Morning Handoff

## Finished

- Polished the Glide workspace with row selection, grouped recipes, scoped runs, quality signals, and run history.
- Added preview-first, read-only HubSpot contact and Salesforce lead imports with append/replace behavior.
- Added BYOK Gemini web-research columns with custom row prompts, live Google Search, citations, and 24-hour caching.
- Added a ten-request cost gate and server-only key handling; ungrounded results are held for review.
- Added a downloadable GTM Control Tower preview plan; Pomade cannot write to either CRM.

## Try It

Paste a Google AI Studio key into the open `.env.local`, restart `npm run dev`, then choose **Add recipe column → AI web research**. Customize the prompt, select up to ten row-column requests, run, and open the receipt to follow its source links.

## Checks

- `npm test`: 26 tests passed.
- `npm run typecheck`, `npm run lint`, and `npm run build`: passed.
- Local route: HTTP 200; Gemini status endpoint reports the key is not configured yet.
- Live read-only preview: 14 HubSpot contacts and 20 Salesforce leads returned; no CRM writes were made.

## Decisions

- Gemini Interactions with native Google Search is the first BYOK research provider.
- Every research run previews its maximum requests and keeps answer citations in the receipt.
- GTM Control Tower remains the only future CRM mutation boundary.

## Remaining

- Paste a Google AI Studio key and complete one live grounded-research run.
- Authorize copying the test CRM credentials into the owner-only Site environment; local previews are verified.
- Replace the test Salesforce bearer token with durable OAuth before broader use.
- Add Apollo phone reveal behind a public authenticated webhook and explicit credit preview.
- Add the receiving preview endpoint inside GTM Control Tower.

## Review First

- `components/pomade-workspace.tsx` for the prompt builder, cost gate, and citation UI.
- `lib/gemini-client.ts` and `lib/web-research.ts` for grounded provider behavior.
- `app/api/runs/route.ts` for caching, run limits, persistence, and receipts.
