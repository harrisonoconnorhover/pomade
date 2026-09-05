# Pomade

**Shape your GTM data.**

Pomade is a programmable grid for importing account data, composing repeatable
research and enrichment recipes, running them safely, and inspecting exactly
what changed. It is an original product built on the open-source
[Glide Data Grid](https://github.com/glideapps/glide-data-grid).

## Current vertical slice

- Import any CSV and edit cells in a fast, virtualized grid with persistent
  column widths, safe drag reordering, stable-ID header renaming, and
  dependency-aware column deletion.
- Preview and import contacts from HubSpot or leads from Salesforce without writing back.
- Add preset formulas or build custom merge formulas with safe transforms and a
  five-row preview, then run selected or visible rows.
- Gate any recipe by a row condition and auto-update safe formula columns when
  an input cell changes.
- Run or queue one recipe directly from its column header against the current
  selected or visible rows.
- Save any configured recipe as a reusable column template, then map its declared
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
- Keep the latest 20 structural workspace versions and restore any one while
  preserving the current table as another recoverable snapshot.
- Summarize recent total, local, provider, cached, observed-credit, and
  unknown-cost actions without presenting partial receipt data as billing.
- Search, filter, sort, add or deliberately delete rows, save reusable filtered
  views, and export the resulting CSV.
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

## Product direction

One open-source product, usable through an independent installation or an
optional Pomade-hosted account. Our current priority is daily usability: table workflows, integrations and
reliable enrichment. Google sign-in and account isolation are deferred until
those workflows work well for us. Hosted signup and complete standalone
self-host packaging are not implemented yet. Development currently uses
Workers/D1 and Sites tooling. Build slices are committed locally; GitHub pushes
and site publication wait for a requested release milestone.

## Work across tables

Use the **Tables** selector above the grid to switch stages. **New table** starts
an empty grid; **Duplicate** copies values, recipes and views without carrying
an active schedule. Runs and version history belong to the selected table.

Select rows and choose **Action → Send selected rows to new table** to make a
separate stage, such as a people list researched from company accounts. The new
table keeps the values and a **Source** button linking each row to its original
record. Upstream recipes become ordinary columns, so using the new table cannot
accidentally rerun the list research. These are snapshot copies; repeatable sync rules remain planned. Existing source rows stay unchanged.

Switching waits for edits to save. If a save fails, use **Retry save** before
leaving the table. Background jobs can continue in their own table while you
work elsewhere.

## Reuse data with a table lookup

Open **Recipe library → Lookup another table**, select source and matching
columns, choose exact text, case-insensitive text, or website/domain matching,
and select up to four fields. Preview the first five rows, then add the lookup.
Run its column from the header menu or include it in a normal/background/scheduled
run. Each run reads the latest saved source data and consumes no provider credits.

The match-status column distinguishes a unique match from missing input, no match,
duplicate matches and unavailable source fields. Unsuccessful matches clear old
lookup values. Receipts include the source table, matching row and source save
time. A later formula can use the returned values in the same run. Lookups can
be saved as templates inside this workbook; portable lookup export, contains
matching and multi-row aggregation are not implemented yet.

## Share a recipe between installations

Save a configured column as a template, open **Recipe library**, and use its
export button to download a `.pomade-recipe.json` file. On another installation,
choose **Import recipe file**, then **Use** and map the inputs to that table.
Import only adds a library entry; it does not run an enrichment or replace rows.
The current workspace save retains the imported library.

Files preserve prompts, formulas, conditions, typed outputs and waterfall order.
They exclude table rows, provider credentials, schedules, receipts and mappings
that project list results into existing columns. List results use new output
columns instead. Review literal prompt and description text before sharing.
Only version 1 files up to 256 KB are supported; this is not a workspace backup.

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

Run history summarizes the latest ten receipts into total and provider work,
cache hits, explicitly reported credits, and provider actions whose cost was not
reported. It is intentionally an operational snapshot rather than a billing
ledger; Pomade does not infer credit prices that a provider did not return.

Version history captures the table before saved grid changes, recipe runs,
Apollo enrichment, and background-job setup. Restore is blocked while a
background job can still write, saves the current table first, and pauses a
restored schedule so historical automation cannot restart unexpectedly.

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

## HTTP API recipes

Configure `POMADE_HTTP_CONNECTIONS` in ignored `.env.local` (see `.env.example`),
then restart Pomade. Each named connection defines an origin, allowed GET/POST
methods and optional authentication headers. Headers stay on the server; the
builder receives only connection names, origins and methods. Keep access to this
single-operator installation private: it does not yet provide account isolation.

Open **Recipe library → HTTP API**, select a connection, enter a relative path
such as `/enrich?domain={{domain}}`, and map one to four JSON response paths
(e.g. `company.name`, `people.0.email`, or `$` for the whole response). JSON POST
bodies support row tokens inside string values. The preview makes no request.
Run the column or a selection and confirm the maximum external request count.
All selected recipes execute in grid-column order, so earlier formulas can
prepare inputs and later formulas can consume API/research results in one run.

Each request has a 15-second timeout, a 1 MiB JSON response limit and 4,000-character
mapped values. Redirects are refused. Generic HTTP calls are neither cached nor
automatically retried; endpoints can charge or change remote data, and receipts
therefore report cost and remote write effects as unknown. Failed requests clear
stale outputs and preserve other results. Technical failures stop background jobs
and schedules. Review receipts before manually retrying a request with possible
remote effects. Pagination, PUT/PATCH/DELETE and inbound webhooks remain pending.
HTTP templates can be reused locally; portable export awaits connection remapping.

## Inbound webhook inbox

Open **Webhook inbox** beside Find companies. It shows the current table ID.
Configure `POMADE_WEBHOOK_SOURCES` in ignored `.env.local`, using `.env.example`,
then restart Pomade. Each source has a table ID and a random bearer token of at
least 32 characters. A sender posts to `/api/webhooks?source=YOUR_SOURCE` with
`Authorization: Bearer YOUR_TOKEN` and an `Idempotency-Key` unique to that delivery.
Send one JSON object or an array of up to 100 objects (maximum 256 KiB).

A 202 response means the delivery is saved in the inbox, not imported or enriched.
Retries using the same key and payload return the original event with 200; a
changed payload with the same key returns 409. Keep the same key after a timeout.
The inbox shows 50 deliveries per page. Select deliveries, map nested JSON paths
to input columns, inspect the preview and import. Existing rows stay intact;
previously imported event rows are skipped. Imported rows retain event provenance,
start in Review and pause any active schedule. Run enrichments when ready.

Events are retained for reimport; deleting an imported row permits its deliberate
reimport. Matching uses delivery identity, not company/domain deduplication.
Mappings currently apply to the open dialog; saved mappings and automatic table
ingestion are pending. Keep the installation private: bearer authentication covers
webhook delivery, while the operator UI and inbox use the existing single-user
trust boundary. Remote senders need a reachable installation; no public endpoint
or tunnel was created for this local build.

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
