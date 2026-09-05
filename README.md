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
- Create custom AI research columns that use Parallel Web Research—or Gemini as a fallback—with clickable citations.
- Enrich one selected person through Apollo with exact-name/company-domain safeguards.
- Persist the workspace, provider cache, and recent immutable run receipts in Cloudflare D1.
- Search, filter, sort, add rows, and export the resulting CSV.
- Inspect row quality and field-level lineage, or download a bounded GTM Control Tower preview plan.

The included formula runner is deterministic and credential-free. CRM
connections are read-only sources. AI web research prefers a bring-your-own
Parallel key and falls back to Gemini when Parallel is not configured. It
requires an explicit run confirmation, caps each run at ten research requests,
caches results for 24 hours, and stores source links with the receipt.
Apollo enrichment remains an explicit selected-row action that may use up to one
credit; it never requests personal emails or phone numbers. Governed CRM writes
remain behind GTM Control Tower's preview, approval, receipt, and rollback flow.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install --legacy-peer-deps
npm run dev
```

Then open the printed local URL. Load a CSV or use the included founder-target
workspace, add a recipe column, and click **Run enrichment**.

To enable grounded web research locally, set `PARALLEL_API_KEY` in the ignored
`.env.local` file and restart Pomade. `PARALLEL_MODEL=speed` is the fast default;
`lite`, `base`, and `core` are accepted for deeper, slower research. If Parallel
is absent, Pomade can use `GEMINI_API_KEY` as a fallback. Add an **AI web
research** recipe, customize the prompt with row variables such as `{{company}}`
and `{{domain}}`, select rows, and run the recipe. Never commit real credentials.

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
safe recipe runner       read-only sources       provider reads
          |             HubSpot / Salesforce    Apollo / Parallel / Gemini
          ------------- D1 workspace, cache, receipts -------------
                               |
         GTM Control Tower preview adapter (governed writes only)
```

## Status

Pomade is a polished working vertical slice, not a complete Clay replacement.
The grid, CSV and CRM source workflow, scoped recipe execution, grounded AI web
research, Apollo person enrichment, persistence, cache, receipts, and Control
Tower handoff are real. Apollo phone reveal, durable CRM OAuth, multi-user
collaboration, and direct CRM write-back are intentionally deferred.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
