# Pomade

**Shape your GTM data.**

Pomade is a programmable grid for importing account data, composing repeatable
research and enrichment recipes, running them safely, and inspecting exactly
what changed. It is an original product built on the open-source
[Glide Data Grid](https://github.com/glideapps/glide-data-grid).

## Current vertical slice

- Import any CSV and edit cells in a fast, virtualized grid.
- Add deterministic formula or enrichment recipe columns.
- Run every configured recipe across the workspace.
- Persist the workspace and recent run receipts in Cloudflare D1.
- Search, filter, sort, add rows, and export the resulting CSV.
- Review field-level inputs, outputs, durations, and external-write count.

The included runner is deterministic and credential-free. It never writes to an
external system. `lib/scoutbound-adapter.ts` is the boundary for a future
self-hosted Scoutbound worker. Governed CRM writes will remain behind GTM
Control Tower's preview, approval, receipt, and rollback flow.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install --legacy-peer-deps
npm run dev
```

Then open the printed local URL. Load a CSV or use the included founder-target
workspace, add a recipe column, and click **Run enrichment**.

## Check it

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Architecture

```text
Glide Data Grid UI
        |
Pomade workspace + recipe schema
        |-----------------------|
safe hosted recipe runner       Scoutbound adapter (self-hosted later)
        |
D1 workspace snapshots + immutable run receipts
        |
GTM Control Tower adapter (governed CRM writes later)
```

## Status

Pomade is an early working product slice, not a complete Clay replacement. The
grid, CSV workflow, recipe execution, persistence, and receipts are real. Live
provider enrichment, authentication, multi-workspace collaboration, and CRM
write-back are intentionally deferred.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
