# Morning Handoff

## Finished

- Added row/action run preview: conditions, missing inputs/connections, finder/verifier order and maximum submissions.
- Added Dropcontact named-work-email and Apollo mobile adapters with saved polling and resume; fixed Parallel's current endpoint/authentication.
- Live 15-person benchmark: 12 accepted emails (9 Hunter + 3 Prospeo fallback); one mobile among the three original contacts.
- Imported the HubSpot segment, joined enrichment, updated one contact in each dev CRM and verified native readback. Repeat previews were unchanged; repeat imports kept three contacts.

## Try It

- Open the DemandDrive benchmark tables locally at http://localhost:8798. Select a few rows and an external action to see the new run preview.
- Account → Connections exposes Dropcontact and Apollo's optional public callback URL. The waterfall builder includes their presets.
- Read `docs/live-benchmark-2026-09-07.md`; private results and table IDs are in ignored `outputs/demanddrive/2026-09-07-workflow-benchmark/manifest.json`.

## Checks

- All 237 focused provider, research, preview and account tests passed across 12 files.
- Typecheck, lint and diff whitespace checks passed. Local and hosted builds passed.
- Compiled Worker/D1 tests passed for Dropcontact and Apollo phone across pause/restart/saved-ID polling/fallback; all requests were synthetic.
- Live Hunter/Prospeo, research, HubSpot and Salesforce checks passed as detailed in the benchmark report. Apollo People returned a Free-plan 403.

## Decisions

- Keep candidate quality distinct from independent verification, and account balances distinct from per-request cost.
- Require a caller-controlled public callback URL for Apollo; retain owner-private hosting and existing synchronous email behavior.
- Preserve raw contact data and receipts outside Git. No GitHub push or paid plan purchase.

## Remaining

- Release the verified source to the existing owner-private site and refresh the local build.
- Apollo live phone validation needs eligible API access and a public receiver; Dropcontact needs a key.
- Fourteen core providers remain; Icypeas is next. Research citations still require review; this sample is not market-wide coverage proof.

## Review First

- `lib/dropcontact-request.ts`, `lib/apollo-phone-request.ts` and their tests.
- `lib/run-preview.ts`, `components/run-preview.tsx` and the live benchmark report.
- `scripts/test-enrow-worker.mjs` and the CRM evidence summaries.
