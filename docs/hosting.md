# Local and hosted Pomade

One codebase supports two independent installations. Local tables remain in
`.wrangler/state`; Sites binds its own D1 database. Table edits do not synchronize.
The Local/Hosted label identifies the installation you are using.

## Build and run

- Local: `npm run build`, then `npm start`. Keep the existing local database.
- Hosted: `npm run build:hosted`. It builds in a clean temporary directory and
  writes `dist-hosted/dist`, leaving the local `dist` and `.wrangler/state` alone.
  Package `dist-hosted` with the Sites packaging helper and deploy the saved version
  to the existing owner-only Sites project.
- The hosted build excludes local environment files and local runtime values.
  Configure hosted secrets through Sites; never upload the local build artifact.

## Private access

Sites must restrict visitors to the owner. Hosted requests additionally check
`POMADE_OWNER_EMAIL` against Sites' authenticated email header. Set
`POMADE_DEPLOYMENT=hosted` and `POMADE_PUBLIC_ORIGIN` to the actual HTTPS origin.
The worker trusts identity headers only behind Sites' authentication dispatcher;
these headers are not a standalone authentication system for another host.
An optional, separately generated owner automation key supports authenticated
initial data copies and maintenance. Keep it in ignored `.env.hosted-ops.local`,
set only its SHA-256 digest as `POMADE_OWNER_TOKEN_SHA256` in Sites, and send it as
`X-Pomade-Owner-Key` together with the Sites dispatch credential. This full-owner
key is never loaded by the research companion. Remove its hosted digest to revoke
it after maintenance. API requests with a foreign browser Origin are rejected. The existing scoped
`/api/v1` and stdio MCP tools remain local-only.

Provider and CRM credentials are configured independently in Sites. Reusing the
same vendor account shares that account's credits; it does not create new credits.
The Mac's Codex login and local helper token are never uploaded to Sites.

## Research on your Mac

Start the existing helper with `npm run research:codex`, then start
`npm run research:companion`. The companion loads ignored, private
`.env.companion.local` containing:

- `POMADE_HOSTED_URL`: the HTTPS origin of your private site.
- `POMADE_SITES_TOKEN`: the Sites dispatch bearer credential.
- `POMADE_COMPANION_TOKEN`: a random connection token, at least 40 URL-safe characters.

Store only that companion token's SHA-256 digest in the hosted secret
`POMADE_COMPANION_TOKEN_SHA256`. Select `POMADE_RESEARCH_PROVIDER=codex`; optionally
set `POMADE_CODEX_BROWSER=true`. The companion token grants only the research
connection endpoint, not access to table or CRM routes.

All connections start from the Mac. No Mac ports are exposed. Hosted research
runs use background jobs: they wait while the Mac is offline and resume when it
reconnects. Each row remembers its remaining columns, so completed provider steps
are not repeated while waiting. Results are retained locally until acknowledged
and accepted only for the matching job lease. Completed answers are reused for
24 hours. Genuine research errors require resuming the failed background run.
Stopping the helper/companion or sleeping the Mac leaves the website available.
A helper crash during a request can require retrying that request; this is not a
claim of exactly-once execution across every possible interruption.

## Automation and copies

Hosted scheduled automations start disabled (`POMADE_SCHEDULES_ENABLED=false`);
manual and explicitly queued runs still work. Imported tables have schedules
paused. Keep any existing local schedules as their current owner. Deliberately
move a schedule's ownership before enabling it on another installation.

Copy tables through the authenticated table APIs, using new table IDs and
remapping references when needed. Preserve existing hosted tables. Do not copy
active jobs, leases, webhook routing, or local API keys into the hosted database.
Hosted schema changes are applied through the checked-in Drizzle migrations.
