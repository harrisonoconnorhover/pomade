# Morning Handoff

## Finished

- Pomade has scoped API keys and nine authenticated `/api/v1` operations for saved tables, search, recipes, receipts and CRM reads/previewed writes.
- An official-SDK stdio MCP server exposes the permitted tools. It is registered as `pomade` in this Mac's Codex configuration, with a private credential-file reference and longer research timeout.
- All nine tools were exercised through a real MCP client. HealthEdge, Clearwater Security and Solera research reused cached results. Both dev CRMs returned three records and verified existing values through the preview/execute flow; no new records or changed field values were needed.
- Refreshed the expired Salesforce dev credential from its existing CLI login. The app is running at http://localhost:8798. No public publishing or GitHub push occurred.

## Try It

Reconnect the Pomade MCP or start a fresh Codex session, then ask: “Show the DemandDrive account and buyer tables, find Clearwater's existing buying committee, and preview its saved HubSpot mapping.” The app must stay running. Start `npm run research:codex` as well for uncached subscription research.

See `docs/api-and-mcp.md`. Generate another key with `npm run api:key -- create "Assistant"`; add `--scopes read,run,crm:read,crm:write` when those permissions are wanted. Key creation/revocation requires rebuilding and restarting the local app. The existing consumer configurations are in ignored `outputs/api-keys/`.

## Checks

- Eight focused tests passed: credentials/revocation, permissions, row/recipe scope, saved CRM mappings and an official MCP client connection.
- TypeScript, lint, script syntax checks, production build and diff checks passed.
- Live API returned 401 for missing/invalid keys and 403 for read-only run/write attempts. The read-only catalog exposed four tools.
- Live MCP exercised nine tools against saved data. Three cached research receipts passed; HubSpot and Salesforce each verified three unchanged accounts. Private receipts: `outputs/pomade-mcp-live.json`.

## Decisions

- Keep API/MCP local and reuse existing execution paths and JSON-schema tool definitions.
- Keep per-consumer secrets private; save only hashes in server configuration. Preserve separate run and CRM permissions.
- Distinguish stored-row search from new company discovery; adding MCP does not add a provider database.

## Remaining

- Live company discovery and easier conversational creation of tables/recipes.
- Hosted users, remote MCP transport/authentication and broader self-host packaging.
- Automatic Salesforce OAuth refresh, PDL business-email connection, and the wider capability backlog in `docs/requested-workflows.md`.

## Review First

- `docs/api-and-mcp.md` for connection setup and local boundaries.
- `lib/pomade-api.ts` and `lib/pomade-api-auth.ts` for tool scope and authentication.
- `scripts/pomade-mcp.mjs` and `outputs/pomade-mcp-live.json` for protocol behavior and live evidence.
