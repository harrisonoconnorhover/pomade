# Pomade API and MCP

Pomade now has a local API and a local MCP server backed by the same saved
workbooks, research recipes, provider connections and CRM sync operations as the
app. The official MCP SDK handles the protocol. MCP makes these operations
available to an assistant; it does not supply an additional company database.

## What works

| Tool | Key permission | Result |
| --- | --- | --- |
| `list_tables` | `read` | Saved table names and IDs |
| `get_table` | `read` | Columns, recipe definitions, CRM mappings, paginated rows and evidence |
| `search_rows` | `read` | Stored text search and AND filters, including numeric ranges |
| `list_runs` | `read` | Recent run receipts, cache use and provider errors |
| `run_recipe` | `run` | Selected existing research, waterfall or formula recipes, saved back to the table |
| `read_crm` | `crm:read` | Existing HubSpot/Salesforce records; no table import |
| `preview_crm_sync` | `crm:read` | Before/after actions using a saved table mapping; no CRM changes |
| `get_crm_plan` | `crm:read` | A saved preview or execution receipt |
| `execute_crm_sync` | `crm:write` | An existing preview executed and checked against native CRM values |

A key only advertises its permitted tools. The HTTP API independently checks the
permission on every call. `run_recipe` requires row and column IDs; external calls
are off unless `allowExternalRequests:true` is supplied. Existing run conditions,
provider caches and the ten-external-action limit still apply. CRM execution
requires `confirmWrite:true` and retains the existing table-revision check,
write claim, uncertain-result handling and native read-back.

## Generate and revoke keys

From the Pomade repository:

```sh
npm run api:key -- create "Assistant" --scopes read,run,crm:read,crm:write
npm run build
npm run start -- --port 8798
```

Stop the previous local preview before starting its replacement. Omitting
`--scopes` creates a read-only key. `read` is always included. Use one key per
consumer so it can be revoked independently.

The command prints paths, not the key. `outputs/api-keys/<id>.env` contains the
usable credential with owner-only file permissions. `<id>.mcp.json` contains a
ready-to-use `mcpServers` configuration referencing that private file. The server
stores SHA-256 hashes in ignored `.env.local`, never the usable API keys.

```sh
npm run api:key -- list
npm run api:key -- revoke KEY_ID
```

**Creation and revocation take effect after a rebuild and server restart.**
The current local build captures environment bindings. Reconnect the MCP client
if its permissions changed. Do not commit or share the generated credentials,
`.env.local`, or generated build bindings.

## Connect an assistant

Keep the Pomade app running. For subscription research, also run
`npm run research:codex` as described in [Codex research](codex-research.md).
The assistant starts `scripts/pomade-mcp.mjs` through standard input/output
(stdio); there is no public MCP URL in this release.

Use the generated `mcpServers` configuration in a compatible local client. For
Codex, the equivalent setup is:

```sh
codex mcp add pomade -- node --env-file=/absolute/path/to/outputs/api-keys/KEY_ID.env /absolute/path/to/pomade/scripts/pomade-mcp.mjs
```

For longer research calls, set `tool_timeout_sec = 660` in the
`[mcp_servers.pomade]` section of the Codex configuration. This Mac already has
Pomade registered with the Local assistant key, a 20-second startup timeout and
a 660-second tool timeout. Reconnect MCP or start a fresh Codex session to load
the new tools. The current conversation's loaded tools may not refresh live.
[Official Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Example request:

> Find the DemandDrive account and buyer tables. Show the existing buying
> committee for HealthEdge, Clearwater Security and Solera with its evidence.
> In the Codex + free enrichment table, run the saved account-summary recipe for
> those three rows using the authorized subscription. Then preview the saved
> HubSpot mapping for the three ICP accounts.

A write-capable key is a technical permission, not an instruction to write every
preview. Follow the user's authorized scope. Existing CRM workflows can be
triggered by field changes. Recipe and CRM calls are synchronous; after a timeout
inspect `list_runs` or `get_crm_plan` before retrying. A disconnected client does
not undo a started operation. Use smaller runs if a client has a shorter timeout.

## Call the API directly

`GET /api/v1` returns permitted tools and their JSON input schemas.
`POST /api/v1/<tool_name>` accepts the same arguments used by MCP. Both require
`Authorization: Bearer <Pomade key>`. For example, from the repo:

```sh
node --env-file=outputs/api-keys/KEY_ID.env --input-type=module <<'JS'
const response = await fetch(`${process.env.POMADE_API_URL}/api/v1/list_tables`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.POMADE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});
console.log(response.status, await response.json());
JS
```

Responses retain provider errors; failures are not successful enrichment. API
status codes include 400 invalid arguments, 401 missing/invalid key, 403 missing
permission or nonlocal access, 404 unknown table/tool/plan, 409 stale/conflicting
work, and 503 missing configuration. Provider failures preserve the underlying
operation's error status. Reads are paginated to at most 100 rows per response.

## Current boundaries

- This is a trusted, single-user local app. Key scopes protect `/api/v1`; existing
  UI routes remain local application routes without hosted user authentication.
  Keep the preview bound to loopback; do not expose the app through a public
  tunnel. The new API rejects nonlocal hosts and cross-origin browser requests.
- Search filters existing table values. It does not discover every matching
  company in a market, verify every contact, or replace Apollo/Hunter/Prospeo.
  Set up research/enrichment columns and CRM mappings in the app first.
- Hosted accounts, tenant isolation, remote Streamable HTTP MCP, and remote
  authentication are future work. This release does not configure a web-based
  ChatGPT/Claude connector or publish anything.
- Salesforce access tokens can expire. Refresh from the existing Salesforce CLI
  login, update the private binding and rebuild/restart; automatic OAuth token
  refresh inside Pomade is not implemented yet.

The design follows the [official MCP SDK](https://ts.sdk.modelcontextprotocol.io/).
[The Firmable example](https://connect.firmable.ai/) combines its database with an
MCP/API connection; database coverage and workflow quality remain separate from
adding that connection to Pomade.
