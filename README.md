# Pomade

**Shape your GTM data.**

Pomade is a programmable grid for importing account data, composing repeatable
research and enrichment recipes, running them safely, and inspecting exactly
what changed. It is an original product built on the open-source
[Glide Data Grid](https://github.com/glideapps/glide-data-grid).

## Current vertical slice

- Import any CSV and edit cells in a fast, virtualized grid.
- Preview and import contacts from HubSpot or leads from Salesforce without writing back.
- Add preset formulas or build custom merge formulas with safe transforms and a
  five-row preview, then run selected or visible rows.
- Gate any recipe by a row condition and auto-update safe formula columns when
  an input cell changes.
- Save any configured recipe as a reusable function, then map its declared
  inputs to another table and recreate its outputs.
- Build ordered data waterfalls across two to six enrichment columns, with the
  first available value and its winning source kept side by side.
- Create single-answer, structured, or list-to-row AI research recipes that use
  Parallel Web Research—or Gemini as a fallback—with clickable citations.
- Start from an ICP description and create an evidence-backed company list with
  canonical company/domain fields without replacing the current table.
- Find current public business profiles at any company row and create canonical
  person/title child rows ready for optional Apollo enrichment.
- Schedule the whole table or a captured selection once, every 24 hours, or
  every 7 days through a durable one-minute worker clock.
- Queue up to 100 rows for durable background execution with progress,
  pause/resume, retry, and per-row receipts.
- Enrich up to ten selected people through Apollo with exact-name/company-domain safeguards.
- Map selected columns to portable HubSpot Contact or Salesforce Lead fields
  and download a preview-only GTM Control Tower handoff.
- Persist the workspace, provider cache, and recent immutable run receipts in Cloudflare D1.
- Search, filter, sort, add rows, save reusable filtered views, and export the
  resulting CSV.
- Inspect row quality and field-level lineage, or download a bounded GTM Control Tower preview plan.

The included formula runner is deterministic and credential-free. CRM
connections are read-only sources. AI web research prefers a bring-your-own
Parallel key and falls back to Gemini when Parallel is not configured. It
requires an explicit run confirmation, caps each run at ten research requests,
caches results for 24 hours, and stores source links with the receipt.
Apollo enrichment remains an explicit selected-row action with a confirmed
maximum of one credit per eligible row; it never requests personal emails or
phone numbers. Batches run at bounded concurrency, reuse cached or duplicate
identities, preserve partial successes, and attach a receipt to every completed
row. Governed CRM writes remain behind GTM Control Tower's preview, approval,
receipt, and rollback flow.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install --legacy-peer-deps
npm run dev
```

Then open the printed local URL. Load a CSV or use the included founder-target
workspace, add a recipe column, and click **Run enrichment**.

Custom formulas use column tokens such as `{{person}}` and may apply `trim`,
`lower`, `upper`, `first`, or `domain` filters, for example
`{{person | first}} at {{company | upper}}`. They are deterministic text
templates, not executable JavaScript. See the living
[Bitscale and Clay capability gap](docs/capability-gap.md) for what Pomade does
and does not support yet.

Open **Recipe engine** or **Action → Recipe run settings** to make a recipe run
only when a prior column is empty, present, equal to, or contains a value.
Conditions are case-insensitive and are checked before provider calls. Formula
auto-update is local and free; external research remains an explicit,
credit-confirmed run.

Scheduled runs persist with the workspace and execute even when the browser is
closed. A future one-time run acts as a delay; recurring runs advance from their
original interval. The scheduler captures stable row IDs when targeting a
selection, uses the same ten-request provider ceiling and run receipts as a
manual run, and stops after an error instead of spending credits repeatedly.

Background runs process a stable row scope one row at a time on the same worker
clock and guarded runner. The grid becomes read-only while a job can still
write, polls D1 for progress, and refreshes saved results and receipts after each
step. A pause takes effect after any in-flight row; failed jobs preserve their
cursor and can retry from that row. One job may hold up to 100 rows and 50 total
research requests, while each individual row keeps the ten-request ceiling.

The CRM handoff builder suggests portable identity and contact mappings, shows
the exact HubSpot or Salesforce destination fields, and packages only selected
columns. Missing clean-record inputs stay visible. The result is still a
preview-only plan: GTM Control Tower owns freshness checks, approval, provider
writes, native receipts, and rollback.

The people finder starts from the active company or domain, accepts a role and
seniority brief, and returns up to 25 current public profiles with title,
LinkedIn URL, role-match reason, location, citations, and lineage back to the
company row. It deliberately does not infer private contact details; eligible
results can move through the separate, credit-confirmed Apollo flow.

Saved views pin a named one-column filter to the workspace. They support empty,
equality, and contains rules, show a live matching-row count in the sidebar,
and automatically reflect later edits and enrichment results. Free-text search
remains temporary, so a saved view never captures an accidental search query.

AI web research can return one answer or populate two to six typed output
columns from one request. Structured outputs support text, date, number, and
yes/no fields. Pomade keeps the raw provider response, validates every declared
key, formats typed values for the grid, and holds malformed responses for
review instead of silently accepting them.

List research uses the same typed field builder but returns an array and creates
one child row per result, up to a configurable 25-row limit for each source
row. Children inherit their source-row context and retain the recipe that made
them. A valid rerun replaces that recipe's earlier children; malformed output
keeps existing rows intact and goes to review.

The dedicated **Find companies** flow turns an ICP brief into that same guarded
list-research primitive. It adds a source row plus company, domain, fit reason,
employee estimate, and headquarters outputs, while preserving every existing
row. Only the new list recipe is included in the confirmation. Adding it pauses
an active schedule until the expanded provider scope is deliberately approved.

Reusable recipe functions live with the workspace. Open **Recipe engine**, save
a configured formula or enrichment as a template, then choose it from **Recipe
library**. Pomade declares the fields the recipe reads, asks you to map them to
the current table, creates collision-safe output columns, and preserves output
types, run conditions, and local auto-update behavior.

Data waterfalls are deterministic local recipes. Choose the source columns in
priority order, reorder them at any time while building, and Pomade creates a
value column plus a source-lineage column. The pair updates automatically as
upstream CRM, Apollo, research, or formula results change.

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
          ------------- D1 workspace, schedules, cache, receipts ---
                               |
         GTM Control Tower preview adapter (governed writes only)
```

## Status

Pomade is a polished working vertical slice, not a complete Clay replacement.
The grid, CSV and CRM source workflow, scoped recipe execution, grounded AI web
research, bounded Apollo batch enrichment, persistence, cache, receipts, and
Control Tower handoff are real. Apollo phone reveal, durable CRM OAuth,
multi-user collaboration, and direct CRM write-back are intentionally deferred.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
