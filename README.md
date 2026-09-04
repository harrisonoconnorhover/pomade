# Pomade

**Shape your GTM data.**

Pomade is a programmable grid for importing account data, composing repeatable
research and enrichment recipes, running them safely, and inspecting exactly
what changed. It is an original product built on the open-source
[Glide Data Grid](https://github.com/glideapps/glide-data-grid).

## Current vertical slice

- Import any CSV and edit cells in a fast, virtualized grid.
- Preview and import contacts from HubSpot or leads from Salesforce without writing back.
- Add grouped formula and enrichment recipe columns, then run selected or visible rows.
- Enrich one selected person through Apollo with exact-name/company-domain safeguards.
- Persist the workspace, provider cache, and recent immutable run receipts in Cloudflare D1.
- Search, filter, sort, add rows, and export the resulting CSV.
- Inspect row quality and field-level lineage, or download a bounded GTM Control Tower preview plan.

The included batch runner is deterministic and credential-free. CRM connections
are read-only sources. Apollo enrichment is an explicit, selected-row action
that may use up to one credit; it never requests personal emails or phone
numbers. `lib/scoutbound-adapter.ts` remains the boundary for a future
self-hosted Scoutbound worker. Governed CRM writes remain behind GTM Control
Tower's preview, approval, receipt, and rollback flow.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install --legacy-peer-deps
npm run dev
```

Then open the printed local URL. Load a CSV or use the included founder-target
workspace, add a recipe column, and click **Run enrichment**.

To enable providers locally, copy `.env.example` to `.env.local`. Set a scoped
`APOLLO_API_KEY` with `people/match` access and/or the read-only HubSpot and
Salesforce variables shown in that file. Never commit real credentials.

## Check it

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Architecture

```text
Glide Data Grid UI | Pomade workspace + recipe schema
                       |
          -------------------------------------------
          |                    |                    |
safe recipe runner       read-only sources       Apollo provider
          |             HubSpot / Salesforce            |
          ------------- D1 workspace, cache, receipts ---
                               |
         GTM Control Tower preview adapter (governed writes only)
```

## Status

Pomade is a polished working vertical slice, not a complete Clay replacement.
The grid, CSV and CRM source workflow, scoped recipe execution, Apollo person
enrichment, persistence, cache, receipts, and Control Tower handoff are real.
Apollo phone reveal, durable CRM OAuth, multi-user collaboration, and direct CRM
write-back are intentionally deferred.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
