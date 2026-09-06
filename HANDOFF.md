# Morning Handoff

## Finished

- Separate local and hosted configuration; clean hosted build preserves local artifacts and data.
- Owner-only hosted access with a server-side owner check and a scoped Mac connection.
- Outbound Mac research companion, durable job/results storage, and pending-row continuation.
- Hosted research uses background jobs; hosted scheduled automations start paused.

## Try It

- Local: `npm run build`, `npm start`, and `npm run research:codex`.
- Hosted connection: `npm run research:companion` using the private companion settings.
- See `docs/hosting.md` for independent data, credentials and deployment instructions.

## Checks

- 277 tests passed across all 48 existing and new test files.
- Typecheck, lint, script syntax, and both local and hosted builds passed before final publishing.
- Hosted build contains no local credentials; local build credentials remain present.
- Private snapshots captured all 13 local tables before migration.
- Live deployment and research verification are pending.

## Decisions

- Reuse the existing private Sites project, with separate hosted data and no GitHub publishing.
- Keep schedules owned locally initially; permit explicit manual hosted runs.
- Use an outbound companion instead of exposing a Mac browser port.

## Remaining

- Publish and verify the private hosted version, then record its real URL and research result here.
- Test Mac disconnect/reconnect and confirm existing local tables remain unchanged.
- Multiple users and remote MCP remain outside this one-owner release.

## Review First

- `worker.ts` and `lib/deployment.ts`: access and pending job continuation.
- `lib/companion-research.ts` and `scripts/research-companion.mjs`: leases and acknowledged results.
- `docs/hosting.md`: operating both installations.
