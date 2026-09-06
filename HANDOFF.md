# Morning Handoff

## Finished

- Private Pomade is live at https://pomade.deleteddeleted.chatgpt.site; local Pomade still runs at http://localhost:8798/.
- Preserved all 13 local tables and the original hosted table; copied three DemandDrive tables into the hosted database.
- Added owner-only hosted access, separate hosted configuration, and an outbound Mac research companion.
- Verified a real hosted research job waiting offline, resuming after Mac reconnection, and saving cited HealthEdge research.
- Verified HubSpot company and Salesforce account reads from both installations; refreshed the existing Salesforce connection.

## Try It

- Open the hosted URL and sign in with the owner account. The Local/Hosted label identifies the installation. Table edits do not synchronize.
- Local restart: `npm run build`, then `npm start -- --port 8798 --ip 127.0.0.1`.
- Mac research restart: run `npm run research:codex` and `npm run research:companion` in separate terminals. Private connection settings are already saved. Keep the Mac awake for research.
- Operating details: [docs/hosting.md](docs/hosting.md).

## Checks

- 278 tests passed across 48 files. Typecheck, lint, script syntax, and local/hosted builds passed.
- Hosted artifact excludes local credentials; hosted builds preserve local artifacts and data.
- HTTP access checks rejected anonymous requests, forged identity, wrong-scope credentials, and foreign browser origins; authorized owner access succeeded.
- All 13 local table row/column snapshots matched. The hosted database has four tables.
- Live research read two pages and saved three cited excerpts. HubSpot and Salesforce each returned one record successfully from both installations.
- Private Sites version 9 deployed successfully from source commit `81f015c`; no GitHub publishing. Verification was functional HTTP testing, not interactive browser QA.

## Decisions

- Use one codebase with independent local and hosted databases and credentials; hosted schedules start paused.
- Keep research on the Mac through an outbound connection, without exposing browser ports.
- Separate the limited research token from the owner maintenance key.

## Remaining

- Salesforce access tokens require manual renewal; automatic OAuth refresh is not implemented.
- Table synchronization, multiple users, and remote MCP remain future work.
- Mac research waits while the Mac or helper is offline; other hosted features remain available.

## Review First

- `worker.ts` and `lib/deployment.ts`: access and pending job continuation.
- `lib/companion-research.ts` and `scripts/research-companion.mjs`: leases and acknowledged results.
- `docs/hosting.md`: operating both installations.
