# Morning Handoff

## Finished

- Saved tables load independently of provider checks, so a slow research helper no longer holds up the grid.
- All five research entry points share a readiness card with **Check again**, local-browser scope and actionable setup errors. Missing Chromium, missing ChatGPT login and an unavailable Codex executable are distinguished.
- Email waterfall presets use selectable name/domain columns, show the chosen provider and keep request details under advanced settings in a scrollable dialog. Failed connection checks can be retried; setup makes the remaining mobile-lookup gap explicit.
- Run receipts display errors and rejection evidence, readable provider attempts, linked browser visits and individually linked quotations. An exhausted waterfall with provider errors no longer incorrectly reports an early stop.
- Updated local preview and research helper are running. The three existing DemandDrive tables retained identical rows and columns across the restart. No new enrichment requests, CRM writes or public publishing occurred.

## Try It

Reload http://localhost:8798. Open **Add AI web research** or **Sources** (the **Load data** panel) and use **Check again**. The card should report **Codex + local browser**, ready for public websites.

Open **Provider waterfall**, select the full-name and domain columns, then choose an email preset for each attempt. Expand **Advanced request settings** only when needed. Creating the columns does not consume provider credits.

Open an existing run receipt. Expand provider attempts or browser visits to see rejection reasons and linked source quotes.

## Checks

- 26 focused tests passed across provider waterfall, provider presets and the local research client/helper. The regressions cover exhausted chains, distinct setup errors and readiness after setup is repaired.
- TypeScript, lint, helper script syntax, production build and Git whitespace checks passed.
- Live local HTTP 200; research readiness confirmed; Apollo company/people, Hunter and Prospeo connections present. Three DemandDrive table content hashes matched before and after restart.
- Browser interaction and visual QA were not performed.

## Decisions

- Preserve the current public-browser workflow and local-only iteration; no new provider accounts or Chrome extension in this polish pass.
- Show ordinary missing data separately from provider errors; retain unknown credit costs and the underlying evidence.

## Remaining

- Configure and live-test a mobile-number waterfall with phone-type evidence and provider access.
- Add an optional signed-in Chrome research method; the reviewed see project remains inspiration only.
- Easier local startup and CRM credential renewal remain future usability work.

## Review First

- `components/provider-waterfall-builder.tsx` and `components/research-connection-status.tsx`.
- `components/pomade-workspace.tsx` connection loading and receipt details.
- `lib/provider-waterfall.test.ts` and `lib/codex-client.test.ts`.
