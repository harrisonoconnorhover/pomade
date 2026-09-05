# Morning Handoff

## Finished

- Added Parallel Chat as Pomade's preferred live-web research provider, with Gemini preserved as an automatic fallback.
- Made the research builder, connection state, run history, and receipts show the provider that actually ran.
- Kept provider keys server-only, added a 24-hour provider-aware cache, and retained the ten-request confirmation gate.
- Verified one real Parallel row run produced a completed receipt with three clickable sources.
- Added the Parallel secret to the owner-only Sites environment without exposing it to the browser or Git.

## Try It

Open Pomade, choose **Add recipe column → AI web research**, customize the prompt, select one or more rows, and run. Parallel `speed` is selected while `PARALLEL_API_KEY` is configured.

## Checks

- `npm test`: 29 tests passed across 8 files.
- `npm run typecheck`, `npm run lint`, and `npm run build`: passed.
- Local provider status selected Parallel `speed`; a one-row end-to-end run returned HTTP 200 with three citations.
- Built Worker exports a callable `fetch` handler.

## Decisions

- Prefer Parallel when both research keys exist; do not silently fall back after a configured provider fails.
- Use `speed` for interactive grid work; allow `lite`, `base`, or `core` through configuration for deeper research.
- Answers without usable source URLs remain in review instead of being marked ready.

## Remaining

- Consider a per-column model selector after real usage shows whether deeper Parallel modes justify their latency and cost.
- Replace the test Salesforce bearer token with durable OAuth before broader use.
- Add Apollo phone reveal behind a public authenticated webhook and an explicit credit preview.
- Add the receiving preview endpoint inside GTM Control Tower.

## Review First

- `lib/parallel-client.ts` for the API boundary, citation parsing, and safe errors.
- `app/api/runs/route.ts` for provider selection, caching, and receipts.
- `components/pomade-workspace.tsx` for provider-aware research UX.
