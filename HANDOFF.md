# Morning Handoff

## Finished

- Public Apollo callback receiver is live at https://pomade-callbacks.deleteddeleted.chatgpt.site/health. It acknowledges JSON deliveries without storing, forwarding or exposing contact data through application routes.
- Both local Pomade and the owner-private website use the server-configured callback by default. Personal custom callback overrides remain available; each account still uses its own Apollo key.
- Added Account → Connections → Apollo → **Test Pomade callback**, including a real hosted synthetic-delivery check. The callback remains online independently of the Mac.
- Released hosted version 27 (`0d47596`) and kept local http://localhost:8798 running. Callback service version 1 uses the isolated source export `52d6089`.

## Try It

- Open https://pomade.deleteddeleted.chatgpt.site and use **Test Pomade callback** in account settings. It uses no Apollo credits.
- When eligible Apollo access is available, save the key, leave the custom callback URL blank, and select the Apollo mobile waterfall preset. Use the background runner.
- Self-hosting and receipt-token rotation instructions are in `services/apollo-callback/README.md`.

## Checks

- 59 focused application tests and four receiver tests passed; the 27 affected callback/account tests were rerun after the runtime correction. Typecheck, lint, diff checks and both application builds passed. Receiver lint has one non-blocking default-export style warning.
- Compiled receiver, account/connection-isolation and Apollo saved-request Worker/D1 checks passed with synthetic traffic. Fixed a Workers redirect-mode incompatibility exposed by the hosted test.
- Anonymous HTTPS callback GET/POST returned 200; wrong token and workbook routes returned 404. Private Pomade still returns 401 without sign-in.
- Live settings callback test passed. Exact table IDs were preserved: 24 local, 16 hosted, seven hosted connections. Served assets match their respective builds. Evidence is in ignored `outputs/apollo-callback/2026-09-07/`.

## Decisions

- Publish only the isolated acknowledgement receiver publicly; keep workbooks private and authenticated Apollo polling authoritative.
- Use a separate receipt token, with only its digest on the receiver. No new database, Mac tunnel, paid plan or GitHub push.

## Remaining

- Real Apollo phone enrichment still needs eligible people/phone API access and webhook-result polling permission. No live Apollo phone lookup was submitted in this task.

## Review First

- `services/apollo-callback/worker.mjs` and its README.
- `lib/apollo-callback.ts` and `db/account-handler.ts`.
- `scripts/test-accounts-worker.mjs` and the saved release checks.
