# Morning Handoff

## Finished

- Added HTTP API recipes with server-stored connection credentials, GET/JSON POST, row-token inputs and one-to-four JSON output mappings.
- Added request preview, stale-output clearing, review reasons and honest unknown-cost/remote-effect receipts.
- Unified local, HTTP and research execution in grid-column order so downstream recipes see earlier results.
- Preserved partial results and stopped background/scheduled runs on technical errors; confirmation limits cover conditions activated by upstream results.
- Updated the competitive checklist and local setup instructions. No public publication.

## Try It

Set `POMADE_HTTP_CONNECTIONS` in ignored `.env.local` using `.env.example`, restart with `npm run dev`, then choose **Recipe library → HTTP API**. Configure a relative endpoint and response paths, preview the request, add the recipe and run it with confirmation. Test servers were stopped after verification.

## Checks

- 123 tests passed across 26 files; typecheck, lint and production build passed.
- Isolated built Worker + D1 + local API passed: credential-free catalog, consent/caps, ordered formulas, GET/POST, escaped JSON, partial results, successful background execution and failed job/schedule stopping.
- Home page returned HTTP 200; final diff whitespace check passed.
- No browser interaction test, real paid provider request or public deployment.

## Decisions

- Connection credentials remain server-side; this remains one operator's installation.
- Generic HTTP has no automatic retry/cache, refuses redirects and reports unknown remote effects.
- Prioritize usable integrations over signup/hosting; keep the broad competitor goal active and commit locally.

## Remaining

- Authenticated inbound webhooks and API-as-source; HTTP pagination/additional methods.
- True provider fallback with per-attempt usage and receipts.
- Repeatable table transfers, richer lookups and reusable multi-step functions.
- More sourcing, signals and governed CRM writeback.
- Later: standalone self-host packaging, portable connection mapping, account isolation, Google sign-in and public release.

## Review First

- `lib/http-enrichment.ts` and tests for request construction, credentials and failures.
- `lib/recipe-pipeline.ts`, `app/api/runs/route.ts` and `worker.ts` for execution order and automation stopping.
- `components/http-recipe-builder.tsx` for connection setup and mapping.
