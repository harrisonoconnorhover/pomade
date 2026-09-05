# Morning Handoff

## Finished

- Optional local Codex research uses the existing ChatGPT subscription, live search, typed results, citations and Pomade's cache. Parallel/Gemini remain selectable.
- Hunter and Prospeo free accounts are created and connected. Credentials remain in ignored private files; Prospeo has a verified-email preset with mobile reveal disabled.
- Researched HealthEdge, Clearwater Security and Solera in **DemandDrive — Codex + free enrichment**. All three summaries/B2B flags and first-party citations persisted; repeat research reused all three cached results.
- Live Prospeo → Hunter fallback found one verified email. HealthEdge lacked verified data; Solera's Hunter result was catch-all. Both remain in review. Prospeo no-match handling and sequential free-tier pacing passed the follow-up.
- Existing dev CRM round trips and disabled automation examples remain available. No GitHub push or hosted deployment occurred.

## Try It

Open http://localhost:8798 and select **DemandDrive — Codex + free enrichment**. Inspect research source links and email attempt receipts. The local server and Codex helper are running; after restarting the Mac, run `npm run research:codex` and `npm run start -- --port 8798` in separate terminals. After changing provider variables, rebuild first. Setup and switching back to Parallel are in `docs/codex-research.md`. Hunter's new account password is in ignored `outputs/provider-accounts.private.json`; Prospeo uses Google sign-in.

## Checks

- 45 focused tests passed; typecheck, lint and production build passed.
- Live subscription research passed for all three companies; cached repeat and table readback passed.
- Both real account APIs returned Free. Live waterfall follow-up used both providers, rejected uncertain emails, and had no technical errors.
- Private receipts: `outputs/codex-and-free-enrichment.json` and `outputs/provider-credit-balances.json`.

## Decisions

- Use the official local Codex CLI; keep ChatGPT authentication in Codex. Explicit subscription selection never silently falls back to API billing.
- Keep research local and one request at a time. Hosted multi-user subscription use is a later design.
- Accept verified work emails only; preserve no-match/catch-all outcomes as review items.

## Remaining

- PDL rejected Gmail and needs an existing business-domain email from Harrison.
- Broader verified-email coverage, verified mobile reveal, and Apollo People access.
- Live visitor/G2/LinkedIn feeds and native CRM routing/workflow/sequence configuration.
- Broader research accuracy evaluation and hosted/self-host packaging.

## Review First

- `docs/codex-research.md` and `scripts/codex-research.mjs`.
- `lib/provider-presets.ts` and the live test table's waterfall receipts.
- `docs/requested-workflows.md` for the remaining capability checklist.
