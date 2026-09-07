# Pomade engineering guide

Pomade is a local and owner-private hosted GTM workbook. Keep practical workflows coherent across both versions.

- Use the existing React/Vinext UI, Glide Data Grid, pure helpers in `lib/`, and account-scoped routes. Read relevant code and Git status before changes; avoid unrelated refactors and new dependencies.
- Preserve saved sheets, provider/CRM connections, scheduled work and the separate public Apollo callback service. Use disposable sheets for UI tests. Do not put keys or private data in Git.
- Run focused Vitest files, `npm run typecheck`, `npm run lint`, and `git diff --check`. Runtime changes require `npm run build` and `npm run build:hosted` before release. The hosted build preserves local `dist/`.
- Use Sites skills for the existing `.openai/hosting.json` project. Keep its owner-only audience. Push source only to the existing Sites repository for private deployment; do not publish development iterations to GitHub.
- Browser QA is authorized during the September 7 night shift. Check actual interactions and responsive layouts; prefer isolated browser sessions and synthetic data. Do not run external enrichment merely to test UI configuration.
- Keep the local app at http://localhost:8798 running. Before restarting, confirm no queued/running local jobs and stop only its exact server process.
- Commit complete, verified increments. Record durable choices in `docs/decisions.md`; update `HANDOFF.md` under 500 words with Finished, Try It, Checks, Decisions, Remaining and Review First beneath `# Morning Handoff`.
