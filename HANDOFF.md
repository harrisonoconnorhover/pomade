# Morning Handoff

## Finished

- Built the Glide-powered workspace with CSV controls and a credential-free batch recipe runner.
- Added selected-row Apollo enrichment for verified work email and business profile data.
- Persisted workspace snapshots, provider cache, and immutable run receipts in D1.
- Added explicit Scoutbound and GTM Control Tower adapter boundaries without changing either existing repository.

## Try It

Run `npm install --legacy-peer-deps`, copy `.env.example` to `.env.local`, set `APOLLO_API_KEY`, then run `npm run dev`. Select a row and click **Enrich with Apollo**; the confirmation names the data sent and maximum credit use.

## Checks

- `npm test`: 11 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed for Pomade source.
- `npm run build`: passed.
- Apollo `auth/health`: HTTP 200 and healthy; `npm audit --omit=dev`: 0 vulnerabilities.

## Decisions

- Pomade is a separate sibling product; Control Tower and Scoutbound stay independently runnable.
- Apollo is a selected-row read with identity/domain checks and a 30-day credit-aware cache.
- CRM changes can only leave Pomade as a bounded Control Tower preview plan, never as a direct write command.

## Remaining

- Add Apollo phone reveal after provisioning a publicly reachable, authenticated webhook receiver.
- Connect the adapter to a packaged Scoutbound release.
- Add the receiving preview endpoint inside GTM Control Tower.
- Add authentication and multiple workspaces before sharing beyond the owner-only deployment.
- Add bulk Apollo enrichment with a bounded credit preview.

## Review First

- `app/page.tsx` for the complete user flow.
- `lib/apollo-client.ts` and `app/api/providers/apollo/route.ts` for provider behavior.
- `lib/scoutbound-adapter.ts` and `lib/control-tower-adapter.ts` for integration boundaries.
