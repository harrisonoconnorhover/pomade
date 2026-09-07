# Product decisions

## Separate sibling product

Pomade is a standalone repository. GTM Control Tower and Scoutbound remain
independently runnable; Pomade integrates through explicit adapters instead of
copying either codebase. This keeps the grid product free to evolve without
regressing existing portfolio work.

## Glide supplies the grid, not the product

Glide Data Grid owns virtualization, navigation, selection, editing, and
copy/paste. Pomade owns workspace structure, recipe columns, execution,
persistence, receipts, and integrations. Pomade uses Glide as an MIT-licensed
dependency and does not copy Bitscale or Clay source code.

## Hosted and self-hosted execution boundaries

The hosted batch runner supports safe deterministic recipes and records zero
external writes. A selected-row Apollo action may read a business profile after
an explicit credit confirmation; exact name and company-domain checks decide
whether a verified work email can be accepted. Scoutbound's richer HTTP,
waterfall, AI, script, and command execution belongs behind a self-hosted worker
adapter. The original CRM-only-through-Control-Tower decision is superseded
for local dev accounts by the 2026-09-05 direct CRM round-trip decision below.

## Apollo email before phone reveal

The first provider slice uses Apollo's synchronous People Enrichment response
for business profile and verified work email data. Personal-email and phone
flags are explicitly false. Phone reveal remains separate because it can add
eight credits and requires Apollo to call a publicly reachable HTTPS webhook;
the current owner-only Site cannot safely receive that callback.

Provider results are cached in D1 for 30 days behind a hashed identity/domain
key. Cache hits report zero new credits. Mismatched identities never expose the
returned person's fields, and uncertain emails stay in review state.

## Apollo batches are bounded and partially durable

The Apollo action targets the active row or up to ten explicitly selected rows.
The confirmation shows the maximum one-credit-per-eligible-row exposure before
the request. Rows without both a person and company domain are skipped, while
two provider requests may run concurrently to keep the interaction responsive
without creating a large burst.

Identical person/domain inputs share one in-flight request, and later duplicates
are recorded as zero-credit reuse. Successful results are persisted even when a
different row fails; failed rows remain unchanged and are reported in the batch
summary. Every completed row retains the same identity evidence and receipt as
the original single-row flow.

## Initial CRM sources were read-only

HubSpot contacts and Salesforce leads enter Pomade through preview-first,
read-only endpoints. Imports can replace the grid or append only unseen records;
stable provider record IDs are retained so repeated imports do not create
duplicates. The first slice deliberately avoids CRM writes and broad object
mapping.

## Run scope is explicit

Recipe runs target selected rows when the user has made a selection and the
currently visible rows otherwise. Receipts report the exact processed row count,
which keeps bulk work understandable after search and filtering.

## Custom formulas are templates, not code

Pomade's first custom formula slice interpolates visible column IDs and supports
a small allowlist of text transforms. It never uses `eval` or executes user
code. Formulas run in visual column order, so a later formula can intentionally
reference an earlier result. The builder previews five rows before the column is
added, while generated values remain editable afterward.

## Conditions run before provider calls

Each recipe may have one row-level condition against a prior visible column.
Conditions are case-insensitive and support empty, equality, and contains
checks. A false condition produces no action receipt and increments the run's
skipped count; for web research, it is excluded from the request total before
the user confirms possible provider cost.

Only deterministic formula columns can auto-update after a cell edit. They run
locally in visual column order, skip the cell being directly edited, and may
feed later formulas. Provider-backed enrichments remain manual so editing a grid
never creates an external request or surprise spend.

## Structured research fails visibly

A web-research recipe may declare two to six scalar output fields with text,
date, number, or boolean types. Pomade adds those fields as adjacent grid
columns, asks the provider for one complete JSON object, formats accepted values,
and records the field map in the receipt. The raw response is retained as hidden
lineage metadata.

Missing keys, invalid JSON, or invalid typed values do not get silently treated
as grounded output. Pomade preserves any valid fields, leaves invalid or missing
fields empty, retains the raw response as lineage, and marks the action for
review. If the response is not parseable JSON, the raw answer also stays visible
in the primary field.

## List research preserves its source row

A list-valued research recipe asks for one bounded JSON array of typed objects
and creates one child row per valid item. The source row remains in place as the
refreshable query/context record, while each child inherits that context and
records its parent row, generating column, and generation time. Generated rows
never recursively run the recipe that created them.

The builder caps each response at 25 items. A valid rerun replaces only children
from the same source row and recipe, preventing duplicate accumulation without
touching imported or manually added records. Invalid output creates no new rows,
preserves earlier valid children, retains raw provider evidence, and marks the
source action for review.

## ICP company lists reuse the guarded list primitive

The dedicated company finder adds an editable ICP source row and one list-valued
web-research recipe to the current workspace instead of creating a separate
table or replacing imported data. Generated companies also populate canonical
company and domain columns, so existing formulas, exports, and downstream
handoff logic can consume them without special cases.

Only the new source row and recipe are included in the immediate provider-cost
confirmation. Adding any new web-research recipe pauses an active schedule,
because prior recurring consent did not cover the expanded provider scope. The
user may review and resave the schedule after inspecting the new recipe.

## Recipe templates use explicit contracts

Any configured formula or enrichment column can be saved as a workspace-level
recipe function. Its template keeps the recipe configuration, output shape,
condition, and auto-update setting, while declaring every field the recipe
reads. Applying it requires mapping required inputs to real columns and creates
fresh, collision-safe output IDs and titles.

Input mappings are stored on the instantiated column rather than rewriting the
saved formula or prompt. This lets the same function run against tables with
different schemas and lets later recipe columns consume its outputs in visual
column order. Templates remain workspace data, so CSV and CRM source changes do
not require a separate template service or database migration.

## Scheduled runs use the same guarded runner

One workspace may store one durable recipe schedule: a future one-time run,
every 24 hours, or every 7 days. The schedule may target the whole table or a
captured set of stable row IDs. Saving a schedule with research columns requires
explicit recurring-provider consent, and the existing ten-request ceiling still
applies when the run becomes due.

A Cloudflare scheduled handler checks due work every minute and claims at
most three workspaces per tick with an optimistic `updated_at` comparison. It
advances a recurring schedule before execution, disables a one-time schedule on
claim, and asks Cloudflare not to retry the event. This keeps overlapping ticks
from deliberately duplicating provider work. A 15-minute lease makes an
interrupted claim eligible again without advancing its interval twice. The
handler delegates to the same run endpoint used by the UI, so caching,
conditions, receipts, and row limits do not fork into a second execution system.
Any failed run disables its schedule until the user reviews and resaves it.
Replacing table rows from CSV or CRM also pauses an active schedule so a saved
scope cannot silently begin running against a different dataset.

## Background jobs advance one stable row at a time

A background job stores up to 100 stable row IDs, an optional recipe-column
scope, the current cursor, progress counts, provider consent, and a lease in D1.
The one-minute worker claims up to three jobs per tick and advances one row in
each. It delegates that row to the normal run endpoint, so conditions, caches,
provider ceilings, list replacement, workspace persistence, and receipts are
not reimplemented.

Only one queued, running, or paused job may own a workspace. While a job is able
to write, the grid and structural controls are read-only and server refreshes do
not trigger an autosave back over newer worker output. Pause lets an in-flight
row finish; resume continues after it. Failures retain the current cursor and
error, while an expired 15-minute lease makes an interrupted row claimable
again. Research jobs require explicit consent and are capped at 50 requests in
total and ten on any single row.

## Initial CRM mappings terminated at a Control Tower preview

Pomade suggests a small portable contact schema from column IDs and titles, but
the operator chooses the final mapping and whether the destination is a HubSpot
Contact or Salesforce Lead. The downloaded plan contains only mapped columns,
records both the portable Control Tower field and provider-native destination
names, caps the preview at 100 rows, and explicitly disallows creates.

In that initial slice, Pomade performed no CRM write. GTM Control Tower handled
fresh reads, duplicate and clean-record gates, explicit approval, native
receipts, and rollback. This adds useful preparation without bypassing the
governed execution workflow that already exists.

## People discovery stays public and composes with Apollo

The people finder is a bounded list-research recipe attached to one company or
domain row. It asks for current role evidence, public LinkedIn URLs, a role-match
reason, and location, then projects verified names and titles into the canonical
person and title columns. Generated people remain provenance-linked children of
the source company and reruns replace only that recipe's earlier children.

The finder does not request or infer private contact details. Work-email lookup
remains a separate Apollo action with its own eligibility checks, explicit
credit confirmation, cache, and receipts. This makes the company-to-person-to-
enrichment funnel composable without hiding provider cost or uncertainty.

## Saved views persist rules, not transient search state

A saved view belongs to one workspace and stores a name plus one column,
operator, and optional comparison value. It recomputes against current row
values, so later edits and enrichments automatically enter or leave the view.
The initial slice uses the same six bounded operators as recipe conditions.

Free-text search and row selection remain temporary UI state. Saving those
implicitly would make a view hard to explain and easy to create accidentally;
they can still narrow an active saved view without changing its definition.

## Visual column layout cannot change recipe execution

Glide Data Grid emits native resize and move events, and Pomade persists those
layout changes in the workspace snapshot. Widths are bounded from 80 to 500
pixels. Dragging can move ordinary columns and move recipe columns around text
inputs, but the relative order of recipe columns cannot change because that
order is also their deterministic execution order. The run-status column stays
anchored at the end.

## Row deletion respects generated lineage and saved schedules

Row deletion is an explicit Action-menu operation with a native confirmation.
Removing a source row recursively removes the generated descendants that cannot
meaningfully exist without it. Removing only a generated child remains scoped
to that child. The action is unavailable while a background job may write.

Captured schedule row IDs are pruned in the same state change. When deletion
empties an active selected-row schedule, Pomade pauses it rather than letting a
future worker run appear successful with no target rows. Historical run
receipts remain immutable.

## Column names are presentation; column IDs are contracts

The Glide header menu edits a column's visible title while preserving its
stable ID. Row values, formula tokens, input mappings, saved views, and list
destinations therefore keep working after a rename. Pomade rejects blank,
overlong, and duplicate display names.

When the renamed column is also a structured research output, its declared
output title changes with it. Waterfall labels update only when they still match
the former default title; a deliberately customized source label is preserved.

## Column deletion cannot leave broken recipes

Pomade permits deletion only when no other column or saved view references the
target. The dependency scan covers formula and prompt tokens, explicit input
bindings, built-in recipe inputs, run conditions, waterfall steps, structured
outputs, list destinations, lineage outputs, and saved views. The column editor
names every blocker instead of silently cascading through user configuration.

After confirmation, deletion removes that field from every row. Child rows made
by the deleted list recipe are preserved as ordinary static rows instead of
being erased. If the deleted column was the final recipe, the existing schedule
is paused. Version history remains the recovery path for the removed values.

## Column-scoped execution reuses the guarded runner

A recipe column's Glide header menu can run now or queue a background job for
the current selected-row scope, falling back to visible rows when nothing is
selected. Both paths send the existing stable column ID to the normal runner;
they do not implement a second execution engine.

Research columns still open the same provider confirmation with its request
count and configured ceiling. Background work still uses D1 leases, workspace
locking, progress, retry, and per-row receipts. Scoping changes which recipe is
eligible, not any safety or evidence behavior.

## Recent usage is not a billing ledger

The run-history dialog summarizes the same latest-ten-receipt window already
retained in the workspace. It separates local actions, provider actions, cache
hits, provider-reported numeric credits, and completed provider actions whose
credit cost was not reported.

Pomade does not infer prices, translate actions into money, or call the summary
a budget. A cached provider result is shown as a cache hit rather than new
spend, while an uncached provider action without explicit credit data remains
unknown. A real ledger still requires provider billing data and a durable
full-history model.

## Restore is bounded and automation-safe

Pomade stores the prior fixed-workspace snapshot before a changed grid save,
recipe run, Apollo enrichment, or background-job setup. Timestamp-only saves do
not create duplicates, and D1 retains the newest 20 versions. The history API
returns counts and source labels rather than row contents until the user chooses
a specific restore.

Restore requires confirmation and first archives the current table, making the
operation reversible. The server rejects restore while a background job can
still write. Any schedule inside the restored snapshot is paused and has its
old lease cleared so restoring data never silently restarts historical
automation.

## Waterfalls compose upstream results

A data waterfall is a local auto-updating recipe with two to six ordered input
columns. It chooses the first non-empty value and writes both that value and the
winning column label into adjacent outputs. Reordering happens while the recipe
is configured, and the saved order becomes part of its template contract. A
direct value edit is preserved and changes lineage to `Manual override`.

The waterfall does not hide or duplicate provider execution. CRM imports,
Apollo results, research recipes, and formulas remain visible upstream columns,
so their receipts and credit controls stay intact. Conditions can gate those
recipes, while the waterfall resolves their outputs without another external
request.

## GTM Control Tower owns mutation

Pomade can export a bounded preview plan containing only the rows and fields
already visible in the grid. The plan blocks record creation and cannot execute
a write. GTM Control Tower remains the approval, execution, receipt, and rollback
boundary, preserving the existing product while making Pomade additive.

## Provider errors preserve uncertainty

Apollo HTTP 403 responses include Apollo's sanitized response detail and explain
that either plan access, API scope, or work-email entitlement may be responsible.
Pomade does not claim a single cause unless the provider says so.

## Web research is BYOK, grounded, and bounded

Parallel Chat is the preferred Claygent-style research provider because it
combines live web research and concise synthesis behind one API key. Gemini
Interactions with native Google Search remains an automatic fallback when a
Parallel key is absent. Provider keys stay in ignored local configuration or
hosted secrets; they are never sent to the browser or stored in a workspace.

Research runs require explicit confirmation because each row-column request can
consume provider credits. Pomade caps a run at ten requests and caches identical
provider, model, and prompt results for 24 hours. Each receipt records the actual
provider and source URLs. External page text is evidence rather than instruction,
and answers without usable citations are held for review.

## One product, two ways to run it (2026-09-05)

Pomade is intended to be open source and independently self-hostable, with an
optional Pomade-hosted account offering the same core grid and execution engine.
Hosting buys convenience and operations. It must not become a requirement to
run the core product. The existing MIT license remains in place; GitHub release
and hosting publication are separate from local commits. During this build
phase, commit useful slices locally and do not push or publish each iteration.

Google sign-in is the preferred initial hosted identity option. Authentication
identifies a person; authorization decides which workspace that person can use.
Before hosted signup, replace the fixed workspace ID with server-authorized
ownership and scope jobs, versions, receipts, caches, and credentials consistently.
Do not expose the current single-workspace API as a public multi-user service.
Select a maintained standards-based login integration when implementing that
slice; do not build password storage. Self-hosting must not depend on a central
Pomade account. Keep provider integrations configurable by the installation.

The present app still depends on the Workers/D1 runtime and Sites integration;
local development is not complete standalone self-host packaging. Defer runtime
migration until that delivery slice needs it. This direction supersedes any
interpretation of earlier execution-boundary notes as requiring separate hosted
and self-hosted core products. Provider and CRM action rules still apply.

## Portable recipes are configuration, not active workflows

Version 1 recipe files carry one recipe, output types, conditions, prompt or
formula text, ordered waterfall sources, and input labels. Import creates a fresh
library entry; existing input mapping and execution controls still apply when
using it. Required inputs are derived from the recipe instead of trusted from
imported metadata. Unknown versions and malformed configurations are rejected.

Exports omit table rows, account configuration, history, schedules, and list
projections into existing columns. List outputs remain new adjacent fields and
child rows, avoiding accidental writes into a same-named destination column on
another installation. Text explicitly placed inside prompts/descriptions remains
in the file and should be reviewed before sharing. This is a single recipe
exchange format, not a full workspace backup or synchronized multi-step function.

## Personal usability comes before signup (2026-09-05)

The active objective is a practical Clay/Bitscale competitor that works well for
our own use. This supersedes the earlier build order putting account isolation
and Google sign-in next. Keep both on the eventual hosted-product roadmap, but
build table workflows, real integrations, provider fallback, signals and reusable
multi-step recipes first. Keep local commits and defer publication.

## Tables reuse the existing workspace execution contract

A table is an independently stored WorkspaceSnapshot. The initial table keeps
its original ID and data. The workbook selector remounts the editor by table ID;
workspace saves, run history, jobs and version APIs all use that ID. A new blank
table starts without sample rows. Duplication copies configuration and values
but never copies an active schedule or historical runs.

Selected-row transfers create a new table containing observed values, with a
source table/row reference on each record. Upstream recipe columns become text
columns, and local generation lineage is cleared so later list reruns or row
deletions in one stage cannot remove another stage's records. Transfers are
snapshot copies, not live sync. The inspector opens the linked source record
and explains when that row no longer exists.

Table switching waits for the current save and foreground actions. Autosaves
are serialized, and failed loads no longer turn a sample fallback into saved
data. Failed saves retain edits in the tab and expose a retry. Background runs
remain scoped to their table and can continue while another table is open.
This is one operator's workbook, not multi-user authorization.

## Lookup recipes read saved source data without another provider call

A lookup has a source table, source key, local input binding, exact/text/domain
matching rule, one-to-four outputs, and a separate match-status column. The
builder previews up to five current rows. Each run reads a fresh saved source
snapshot once per referenced table and indexes it once per lookup column.
Downstream local formulas see lookup outputs in recipe-column order.

Only one match is accepted. Missing input, no match, duplicates, missing source
table and missing source columns clear old lookup outputs and leave an explicit
review reason. A unique match with an empty source field remains a matched
record, accurately preserving that empty value. Receipts record the source table,
source row and snapshot save time. Lookups do not update the source table or
make provider requests. Background and scheduled work reuse the same runner.

Lookup templates can be reused within this workbook and remap their local input
and output IDs; source-table references remain explicit. Portable recipe export
currently refuses lookups because it cannot remap a table on another installation.
Local receipt durations now measure actual execution rather than simulated time.

## Generic HTTP connections and ordered execution

The operator configures named origins, allowed methods and headers in server
configuration. Saved recipes contain a connection ID, relative path, optional
JSON body and output mappings. Row tokens cannot change the connection origin;
POST interpolation occurs after parsing JSON. The browser receives no configured
headers. This deliberately supports operator-owned internal APIs and is not a
multi-user credential permission model.

Selected recipe columns run in grid order against the latest row values. Scope
limits and consent use the maximum possible external calls, including conditions
that upstream results could make true. Existing research caching remains; HTTP
requests have no automatic retry or cache because their remote effects are
unknown. Receipts retain partial successes and technical errors; background jobs
and schedules stop on technical failures while ordinary data-review outcomes
remain reviewable results. Explicit manual retry still needs endpoint judgment.

The first HTTP slice supports GET and JSON POST, 15-second requests, 1 MiB JSON
responses, one-to-four mapped fields and no redirects. Same-installation templates
remap row inputs and outputs. Export rejects HTTP recipes until cross-installation
connection mapping exists. Keep commits local and defer signup and publication.

## Webhook delivery uses a durable inbox before table import

The current editor saves a complete table snapshot. Uncoordinated incoming table
writes could be lost on a later editor save. This slice stores authenticated
JSON deliveries separately and imports through the editor's existing save path.
Automatic ingestion requires safe concurrent table writes and stays on the roadmap.

Named server-side sources bind a token to one table. Delivery ID is a hash of the
source, table and sender's Idempotency-Key; a unique database key deduplicates even
concurrent requests. Reused keys with changed serialized records return 409.
Events retain their raw records. Import uses stable event/index row IDs, skips
existing IDs and records provenance. It does not match people or companies by
business keys. Import pauses an active schedule before expanding its row scope.

This remains a private single-operator installation: the delivery endpoint needs
a bearer token; operator inbox reads share the rest of the application's current
access boundary. No tunnel or public deployment was created. Events are retained,
and mappings are currently dialog-local; automatic processing and retention
management remain follow-on work.

## Save webhook mappings with the table

Each source name has its own column-to-JSON-path mapping in the table snapshot.
Existing autosave and version history persist these presets without another
configuration store. Selecting a source filters its deliveries before pagination
and restores its preset; source changes clear prior selections. Validation rejects
missing destination columns rather than silently omitting mapped values. Duplicate
tables drop source-bound mappings because receiver routing remains server-configured.
Automatic delivery processing still requires concurrent-write coordination.

## Automatic webhook ingestion and concurrent table saves

This supersedes the inbox-only delivery limitation. Opted-in sources use their
saved mappings on worker ticks. The import and processed-event marker share one
D1 transaction; stable row IDs retain manual-import deduplication. Mapping/capacity
failures pause the source, retain the event and expose the reason. Active jobs or
running schedules defer ingestion. Imports still pause existing recipe schedules
and never themselves initiate paid enrichment.

Table snapshots carry revisions. SQLite rejects an update unless its revision is
exactly one beyond the stored snapshot, including competing transactions. Grid
saves send their last saved base: three-way merging preserves independent changes
and appends, while same-cell and deletion/edit conflicts fail visibly. Foreground
results merge against the latest table without expanding their original row or
column execution scope. Idle editors refresh from the server. History restoration
uses the current revision and disables webhook auto-import. This is concurrency
protection for our operator workflows, not collaborative authorization.

A small local clock drives the same scheduled handler used in hosted operation.
It uses only localhost and never deploys anything. This makes background work
usable locally without a cloud account; independent runtime packaging remains open.

## API sources save fetched batches before mapped imports

List fetching reuses operator-configured HTTP connections and their server-side
headers. It supports GET/static JSON POST, root or nested record arrays, and
query-parameter page, offset or cursor pagination. Each explicit fetch is capped
at ten requests, 500 records and 750,000 raw record bytes; each response retains
the existing 1 MiB/15-second bounds. Repeated cursors stop; failed later pages
retain earlier results. Reaching a cap is reported separately from exhaustion.

Fetched batches are stored separately from workspace snapshots, so receiving data
does not compete with grid edits. Import uses the current workspace and existing
save/merge path, preserving other rows and pausing schedules. Optional stable
identity uses the connection, endpoint and returned ID. Existing records are
skipped, not updated; without a stable ID only the same batch is deduplicated.
Source fetch counts/cost uncertainty live in batch history, not recipe receipts.
The latest ten batches are listed; retention management remains future work.

This is a manual source workflow. Scheduled refresh, body-based/next-URL pagination
and update-existing-record rules remain explicit gaps. Keep all iteration local.

## Provider fallback is one logical recipe with multiple observed attempts

A provider waterfall contains two-to-four ordered HTTP request configurations
and a nonempty or email-format acceptance rule. It evaluates sources lazily and
stops at the first accepted value. Misses continue; technical errors stop unless
the operator configures continuation. A recovered error remains in its attempt
receipt but does not mark the whole result failed. No accepted result clears the
old value and provider; unrecovered technical errors stop background automation.

The parent receipt describes the logical result; nested attempt receipts preserve
actual requests, values, duration and unknown costs. Usage counts leaf provider
attempts, while run action counts remain logical recipe actions. Request consent
uses the maximum number of provider steps, even if the first may succeed. Inputs
are dependency-tracked and template-remapped. Portable export remains blocked
until server connection references can be remapped across installations.

Real Worker testing found and corrected a prior unsaved-row execution issue:
foreground result merging now uses the stored table as its execution baseline,
while revision checks reject stale requests before provider calls. This preserves
new unsaved rows and concurrent additions without repeating enrichment requests.

## Repeatable transfers preview destination mutations before applying

Rules live in the source snapshot and specify destination, match keys,
normalization, mapped fields, add/update mode and blank-value policy. Matching
accepts only unique keys within the selected source scope and destination table.
Missing/duplicate keys become review entries without writes. Existing unmapped
fields and destination key formatting remain intact. Changed rows link to their
source; local automatic formulas refresh without provider calls.

Preview reads saved snapshots. Applying requires the same source and target
revisions and commits the target snapshot and receipt atomically. Active target
jobs/running schedules block transfers; successful changes pause an enabled
schedule. Receipts retain the applied rule, counts and up to 100 sampled changes
with bounded display values. They are not an exhaustive field audit for large
transfers. Repeated unchanged transfers skip existing values. Source rules are
not copied into duplicated tables, and missing target columns fail validation.

Saved rules are manually rerunnable, not scheduled synchronization or deletion
propagation. Testing also corrected automatic formula refresh when no single
edited-column ID is supplied, as required by multi-field transfers.

## Lookup comparison and result mode are independent

Existing lookups default to equal normalized keys and one unique match. Optional
contains comparison tests whether the normalized source key includes the local
key; it is directional. Optional result mode counts matching rows or collects
values as JSON arrays. Lists preserve source order, blanks and duplicates across
output fields. Count/no-match yields zero, list/no-match yields an empty array;
missing inputs or sources remain errors requiring review.

Lists reject more than 100 matches or 4,000 characters per output instead of
presenting truncated results as complete. Counts cover all matches. Receipts
include source snapshot context, result mode and bounded row evidence. These
settings remain copied in local recipe templates. They do not add provider calls,
source mutations or numeric/grouped aggregation.

## 2026-09-05 — Same-row recipe functions

- Capture two to ten configured recipe templates in grid order and infer shared
  external inputs from their actual bindings. Remap earlier structured outputs
  automatically; reject forward dependencies and list-producing steps rather
  than silently change row scope.
- Reuse the existing ordered runner and background queue. Function membership
  scopes the ordinary selected/visible-row action to its primary recipe columns;
  adding external steps pauses enabled schedules for scope review.
- Store definitions in table snapshots and copy them into new independent column
  groups. No live version propagation, portable connection remapping, accounts or
  publication in this slice. Continue local-only iteration.

## 2026-09-05 — Scheduled recipe-to-transfer workflows

- Extend the existing schedule with optional function membership and a captured
  transfer rule. Legacy schedules retain all-column execution and no transfer.
  Reuse ordinary provider consent/counts for the selected function.
- Transfer original scheduled rows after recipe success; stop the whole transfer
  on ambiguous keys. Commit destination changes, receipt and source completion
  in one D1 batch with existing revision checks. An interrupted recipe run may
  still repeat on lease recovery; do not claim exactly-once provider calls.
- Keep one source-to-destination flow in this slice. Scheduled API-source refresh,
  child-row routing and arbitrary branching remain future work. Preserve current
  destination schedule pause behavior and local-only iteration.

## 2026-09-05 — Scheduled API refresh before recipes

- Capture a previously fetched complete API configuration and field mapping in
  the schedule. Require stable IDs; update mapped fields including blanks, add
  unseen IDs, preserve other values and retain absent records.
- Keep each batch before import. Failed, partial and bounded/truncated fetches
  stop the workflow before changing inputs. Successful input updates persist
  before downstream execution, and empty tables/results support zero-action runs.
- Source-refresh schedules run all table rows after ingestion and retain existing
  recipe scope and post-run transfer behavior. Bound source requests separately
  and estimate recipe scope using maximum potential new rows. No deletion sync,
  arbitrary branching or exactly-once provider guarantee.

## 2026-09-05 — Local multi-table workbook templates

- Save structures for one to ten tables without rows or import/run provenance.
  Preserve local recipes, functions, views, source settings and transfer rules;
  recursively remap their table references on creation.
- Outside references require an explicit compatible table binding. Validate lookup
  fields and transfer mappings before creating every new table in one D1 batch.
  Preserve column IDs within each new table; different outside schemas need a
  later field-remapping interface.
- New tables are empty, schedules paused with row/time/history fields cleared,
  and webhook ingestion disconnected. Local provider connections remain named
  references. No public export, shared version rollout or provider execution.

## 2026-09-05 — Conditional transfer fan-out and child routing

- Evaluate each transfer condition before key matching. Route source rows,
  current children from one selected list recipe, or their union. Child scope
  follows selected parent IDs and does not claim only newly created children.
- Capture up to five independent branches with different destinations. Matching
  rules all receive a row; this is fan-out rather than exclusive if/else. Prepare
  every destination update and commit with receipts/source completion in one D1
  batch. A branch error leaves all destination data unchanged.
- Preserve legacy single-transfer schedules and remap branch destinations in
  workbook templates. No nested graph executor, automatic downstream provider
  calls or public publishing in this slice.

## 2026-09-05 — Previewed per-copy function versions

- Retain prior saved definitions as version history and record applied version
  and external bindings on each new function copy. Compatible updates reuse
  existing output IDs, names and widths, including structured HTTP outputs.
- Apply one explicitly previewed copy at a time, replacing its local recipe
  settings. Preserve values until rerun, mark rows Review and pause the schedule.
  Older versions use the same planner for rollback; ordinary workspace revision
  checks protect concurrent edits.
- Require unchanged step/output counts and output types. Structural migrations
  and bulk rollout remain separate work. Include history lookups in workbook
  reference capture/remapping so copied rollback definitions stay connected.

## 2026-09-05 — Observed field-change signals

- Watch up to ten data fields per table. Existing stable rows provide the prior
  value; new rows establish a baseline. Record exact value changes with optional
  blank suppression, limited to each operation's affected fields and rows.
- Commit signal batches with recipe, scheduled source or transfer updates. Store
  the first 200 event details and exact omitted count, shorten values to 500
  characters explicitly, and paginate batches in the inbox. Review is batch-level.
- Do not claim independent external-event detection or notifications. Watch
  coverage follows configured data sources and recipe outputs. Retain watch
  configuration in templates; history stays with its original table.

## 2026-09-05 — Apollo company preset over the HTTP runner

- Reuse `APOLLO_API_KEY` through a reserved server-side connection and retain the
  existing HTTP recipe execution/confirmation path. Keep key material out of
  public summaries and saved column configurations.
- Normalize domain input and require matching `organization.primary_domain`
  before accepting mapped company fields. Flag absent fields and withhold a
  mismatched response. Restrict preset request shape; arbitrary APIs use custom
  HTTP recipes.
- Distinguish Apollo's documented one-credit price from observed usage. Receipts
  report unknown actual credits. Validate with public docs and local/mocked
  responses; paid live validation requires separate scoped authority.

## 2026-09-05 — Keyed numeric lookup rollups

- Extend the existing lookup recipe with sum, average, min and max rather than
  introducing a second aggregation engine. Preserve modes in reusable templates.
- Ignore blanks, reject nonnumeric text and clear every selected output when an
  aggregate fails. Empty sum is zero; other empty aggregates require review.
- Use finite JavaScript arithmetic with compensated summation and 15 significant
  digit presentation. Require cleanup of currency/percentage formatting; this is
  a workflow summary, not an arbitrary-precision accounting engine.

## 2026-09-05 — Direct local CRM round trips

The user explicitly authorized writes to the existing HubSpot and Salesforce dev
accounts. Add direct field-mapped company/contact creates and updates in Pomade,
plus Salesforce Leads, instead of requiring a separate Control Tower application
for this local workflow. The existing preview export stays available. Use
existing server-side credentials and HubSpot object read/write scopes; durable
OAuth, continuous sync, custom objects and native HubSpot associations can follow.

Use a small preview/confirm flow with read-back receipts, native IDs, nonblank
field writes and fresh conflict checks. Prefer native IDs, then domain/website
for companies or email for people. A contact without email may match by full
name plus company website/AccountId; the provider must return at most one match.
Record actual returned values and accept URL scheme/trailing-slash normalization,
which HubSpot applies in practice. Stop uncertain writes and reconcile their
native record before retrying. Serialize local batches to avoid overlapping
creates; no automatic rollback or interrupted-batch recovery is claimed.

Keep `npm run start` persistence at project-root `.wrangler/state`. Wrangler's
previous default nested state below `dist/server` disappeared on a rebuild.
Live source snapshots and private CRM receipts belong in ignored `outputs`,
not a future open-source release. The assignment retains raw AI results and
reviewed scores separately; buyer titles are candidate signals, not proof of
code ownership or purchase authority.

## 2026-09-05 — Repeatable CRM mapping setup

- Keep up to 20 named CRM mappings in each existing workspace snapshot, so the
  ordinary save, version history and table duplication preserve them. Save only
  provider/object, field bindings and optional ID column; row scope is chosen
  anew at preview. Reuse the same mapping validation as live CRM previews.
- Copy verified native IDs as an explicit local table action. Use the configured
  ID column or a provider/object text column, then update saved mappings with the
  exact same configuration to use it. Skip unverified receipts, changed/removed
  rows and conflicting IDs. This avoids attaching an old receipt to a new entity
  after research inputs or CSV data change. No additional CRM request is made.
- Treat saved mapping inputs and ID columns as deletion dependencies. Keep this
  slice within manual writes; continuous sync, portable mapping templates and
  native HubSpot associations remain separate work.

## Compound qualification (2026-09-05)

Run conditions support up to eight rules combined with all (AND) or any (OR),
including numeric comparisons. Old single-rule recipes remain compatible. Blank,
range and nonnumeric values do not qualify for numeric rules. The pipeline
evaluates conditions immediately before each step so upstream results can gate
spending. Templates remap every condition input and deletion checks protect them.

## Verified waterfall acceptance and company coverage (2026-09-05)

Verified email and phone modes require a provider-reported accepted status and
valid format. Hunter accepts only valid; Apollo accepts verified. Preserve format-
only modes for backwards compatibility. HTTP 451 stops fallback even when
technical-error continuation is enabled, because Hunter uses it for removal
requests. Keep keys in reserved server connections. Existing basic Apollo recipes
remain unchanged unless upgraded to the rich preset. Real technology lists needed
a 20,000-character array limit; other text retains the existing smaller bound.

## Typed CRM properties (2026-09-05)

Keep the original standard-field path compatible. Adding a native/custom field
captures metadata for the editor and saved mapping; the server refreshes native
metadata before preview and does not trust client-supplied types or writability.
Normalize numbers, booleans, ISO dates and option values before writes and native
read-back. Only requested extra CRM properties are imported and refreshed in
`crm_property_` columns, preserving other local columns. Blank values still do
not clear CRM fields. Native property updates may trigger existing CRM workflows;
no prospect messaging was authorized or sent.

## Signals and scheduled CRM (2026-09-05)

- Reuse the existing account rows, signal batches and scheduler. Keep event time
  separate from observation time; technology set changes and leadership title
  changes describe source observations, not inferred hire/install dates. Signal
  projection into five table fields is opt-in and reads the newest 100 batches.
- Capture at most two distinct CRM/object mappings per schedule, with up to 25
  qualifying rows each. Reuse the existing native preview/read-back flow and
  stable per-execution batch IDs; uncertain writes stop for inspection. No
  additional workflow engine or automatic CRM rollback is introduced.
- Structured Parallel requests use JSON schema; malformed answers stay in raw
  evidence rather than downstream fields. Direct ATS checks were added after a
  real stale listing returned HTTP 200. Keep manual source review explicit: valid
  JSON/citations alone did not establish current roles, dates or relevance.

## Approved CRM custom-field activation (2026-09-05)

- Apply the user's approval to read/edit access for exactly the three Pomade
  Account fields on the existing Salesforce System Administrator profile. Create
  matching HubSpot properties in the signed-in interface, preserving the API
  token's existing scopes. No broader permission changes are needed.
- Reuse the existing company IDs, reviewed source values and saved mappings.
  Keep ICP research tags distinct from live intent. Verify native values, import
  persistence and unchanged repeats before marking field setup complete.
- Include custom fields in the saved automation and capture them in a new
  one-time schedule, retaining the previous receipts. Leave the successful test
  schedule disabled; recurring operation remains an explicit local setup choice.

## 2026-09-05: Optional local subscription research and free email providers

Use the official Codex CLI with its managed ChatGPT login through a small
loopback helper. Keep subscription use explicit, one request at a time, with
no API fallback; continue to support Parallel and Gemini. A remote hosted
subscription pool is outside this local slice. Keep research provider/CRM
credentials out of the Codex child process.

Hunter and Prospeo are directly connected free accounts. Prospeo's first preset
requests verified work email only, with mobile reveal disabled. PDL signup is
blocked on a business-domain email; do not use another personal address to
circumvent its restriction. Credentials and account passwords stay in ignored
local files. Provider credits and subscription usage are different meters.

## 2026-09-05: Local API keys and MCP

Expose nine bounded operations through `/api/v1` and an official-SDK stdio MCP
bridge. Reuse existing saved table, recipe and CRM handlers rather than accepting
arbitrary replacement workspaces or duplicating provider execution. Publish one
JSON-schema tool catalog so the API and MCP agree on inputs and permissions.

Use random per-consumer keys with server-side SHA-256 hashes and separate read,
run, CRM-read and CRM-write scopes. Keep generated credentials in ignored private
files. Key changes follow the existing local binding rebuild/restart process.
This remains a trusted single-user local app, not hosted authentication. Register
the local MCP in Codex; remote transport and tenant accounts remain later work.

Distinguish stored-row search from live company discovery. Expose existing
research conditions, caches, CRM previews and native verification. Keep calls
synchronous for this slice; document timeouts and receipt inspection rather than
introducing another job runner. Refresh an expired Salesforce session using the
existing CLI login, without changing its organization or permissions.

## 2026-09-05: Browser research on the user's machine

Add an optional Playwright/Chromium reader to the existing Codex subscription
helper. The model chooses public pages and follows returned links through one
read-only MCP tool. Keep one isolated browser per research request and six page
attempts; reuse existing typed output handling, row persistence, cache and MCP
recipe execution. Do not build distributed browser infrastructure for personal
batches.

Require actual browser visits and exact quotation matches before accepting browser
citations. Keep visit outcomes and source quotes in receipts and row evidence,
with a separate cache identity from search-only research. Failed access is not
negative evidence. Preserve source text only temporarily; retain the bounded
quotes and visit metadata as the useful durable evidence.

Use a clean browser context without Chrome account cookies or write interactions.
Block private-network destinations and non-read methods because public websites
are untrusted and the reader runs alongside the user's local services. Leave
logged-in sessions, arbitrary UI actions and other model providers for a later
requested slice.

## Research and enrichment usability, 2026-09-05

Load saved tables independently of provider readiness. The existing research
dialogs share a connection check with an explicit refresh action; missing browser
installation, missing ChatGPT login and an unavailable Codex executable produce
different setup instructions. Checking readiness does not run enrichment.

Email waterfall presets bind to columns selected in the table. Preset request
details remain editable under advanced settings, while custom requests preserve
their explicit inputs. Receipts expose recorded rejection reasons and source
quotes. Exhausting a chain after a recoverable provider error is distinct from
stopping early; both retain the underlying error for review.

## 2026-09-05 — Independent local and private hosted operation

- Keep one source tree, independent local/hosted D1 data and credentials, and a
  separate clean hosted build artifact. Hosting never replaces local state.
- Use the existing owner-only Sites access plus a server-side owner check.
  Keep API/MCP keys local. Hosted schedules start paused to avoid duplicate CRM
  automation; explicitly queued manual jobs continue to run.
- Route hosted subscription research through an outbound Mac companion and D1
  jobs. Persist partial row progress and an acknowledged-result outbox; reuse the
  existing isolated Codex/Playwright helper rather than exposing its local port.

## HubSpot segment imports

- Segment selection is explicit and separated from record loading. Fetch all
  catalog pages for the chosen object, then preview only its member IDs. Keep the
  unfiltered CRM preview as an explicitly labeled option.
- Use the existing CRM import and native-ID merge behavior. Load member pages in
  batches of at most 100 and retain the selected segment in source metadata;
  do not silently import only the first page or automatically refresh membership.
- Keep the existing 100-column/5,000-row capacities. New provider subscriptions
  remain recommendations until Harrison chooses a budget and authorizes a purchase.

## 2026-09-05 — Reviewable CRM refresh

- Reuse the existing read and native-ID merge paths for manual refresh. Persist
  object type and extra property names with the source; recover earlier imports
  from their segment or unambiguous row identities.
- Show additions, changed values and unchanged records before merging. Only count
  records not returned after a complete preview, and always keep those rows.
  This avoids mistaking a partial page or a mixed-source sheet for lost membership.
- Preserve recipe-owned outputs, run status and column order during a merge,
  including recipes that write to standard email/phone fields. CRM input fields
  may change or clear as shown in the preview. Enrichment is not rerun; scheduling
  and automatic removal remain separate future work.

## 2026-09-06 — ChatGPT research model controls

- Read picker-visible models and supported reasoning efforts through the official
  Codex app-server `model/list`, using a metadata-only session. Keep the existing
  isolated `codex exec` research path and pass resolved model/effort explicitly.
- Persist app defaults separately in each installation and optional overrides on
  research columns. Preserve overrides in recipe templates/files; include model,
  effort and browser mode in both research cache and companion request identities.
- Add reasoning effort to the existing durable companion queue and publish its
  cached account catalog to the hosted app. Require the updated companion protocol
  before assigning jobs. Receipts record completed invocation settings; missing
  metadata is never replaced with guessed settings from the current configuration.

## 2026-09-06 — Natural-language workbook planning

Use a text-only ChatGPT planning request to translate a brief into a bounded workbook
plan. Compile supported research, list, score and transfer steps into ordinary
Pomade columns and saved routes. Validate column references, numeric scoring
inputs and forward table dependencies before creating the sheets. Keep one
request row initially; the planner designs research rather than supplying
unverified prospect data as finished results.

Create all new sheets in one database batch. Reuse a creation ID and matching
plan fingerprint for retries so a lost response cannot duplicate or overwrite
a workbook. Persist the request and run guide in the existing workspace
snapshot. Add a purpose field to the existing companion queue so planning
and research remain separate, and let only an updated companion claim plans.
The planner disables tools and web search; subsequent research uses the normal
configured provider and evidence checks. A live browsing-based plan timed out;
a Parallel base draft failed the structural checks, so this slice uses ChatGPT
for planning.

Run each step through the established research and transfer controls. List CRM,
contact enrichment and presentation tasks separately when this planner cannot
wire them. Score evidence with a local points rubric totaling 100; absent or
invalid points and failed qualification gates remain in Review. Clear original
request/guide metadata from templates and duplicates to avoid stale navigation.

## 2026-09-06 — Workbook execution, CRM refresh, and free-provider usability

Reuse the existing row job queue for prompt-built workbook steps. Store an ordered
run, captured recipe/route configuration, scoped row IDs, current job, and cursor
in one additive workbook_runs table. Commit transfers and cursor updates together;
preserve the previous cursor when a transaction fails. An active workbook is unique,
and pause/cancel does not reset an in-flight row lease. Reserve worst-case external
requests before queuing and charge explicit failed-row retries against that bound.
Finish local routing/empty steps in a bounded loop between actual provider work.
Completion means processing finished, not that all research is qualified.

CRM refresh stores its source selection, interval, state and summary separately
from the workbook snapshot. Fetch bounded pages, merge by native CRM identity,
preserve recipe-owned outputs, and retain departed records with membership labels.
Only a complete source read establishes absence. Use Salesforce ID pagination,
validate cursors, and renew sessions from existing server-side OAuth credentials
only after HTTP 401; never retry ambiguous writes. Source refresh schedules are
opt-in and independent of the hosted copy's disabled legacy recipe schedules.

Start the local clock with npm start. Per-column provider choices make Parallel
and ChatGPT usable together without changing the installation default. Parallel
list schemas use an object root and are unwrapped for the existing list parser;
the live API rejected the previous array-root schema. Prospeo verified-mobile
presets require verified status, an explicit reveal, and a full international
number. Provider balance endpoints expose quota fields only; Parallel's balance
remains dashboard-only. No paid account, topup, outreach or public publishing.

## Hosted refresh wakeups (2026-09-06)

The private Sites release did not deliver native cron events during the live
refresh check. Reuse authenticated owner-page polls and the existing outbound
Mac companion to advance due CRM refreshes and workbook jobs, with in-instance
coalescing and existing database leases. This adds no scheduler service or new
credentials. The UI states that either the website or companion must remain
active; missed refreshes catch up. Keep the native scheduled handler for
self-hosting, but do not claim unattended Sites timer delivery.

## 2026-09-07 — Invite-only friends beta

Keep the current private Sites social sign-in. Its trusted stable user ID binds
an allowed email on first sign-in. Pomade membership and the private Sites
visitor list are separate gates; adding a Pomade account does not send an email
or change the website audience. Three active/invited members plus the owner is
the initial limit. Direct Google OAuth and CRM OAuth application registration
are outside this first token-based connection release.

Give each member a complete namespace of the existing 17 D1 data tables. Keep
the owner's original names and records unchanged. The central accountDatabase
adapter rewrites application-owned SQL identifiers, including indexes, triggers,
foreign keys, and qualified columns; user values remain bound parameters. This
is a small-beta storage choice, not an arbitrary SQL sandbox. New data tables
must be added to ACCOUNT_TABLES, ensureDatabaseSchema, and migration coverage;
bump ACCOUNT_SCHEMA_VERSION when member schemas need an upgrade. Worker withEnv
carries the scoped DB and credentials across route handlers and background work.
The real Worker test verifies concurrent routing, in addition to SQLite tests.

Encrypt personal connection values with AES-256-GCM, random nonces, and the
account/provider as authenticated context. Back up the vault key separately from
the database; never rotate it without re-encrypting saved values. Import owner
environment credentials once. Clear every personal provider/CRM/research setting
before loading a member's values. Disconnect must not recover an environment
fallback. Clear provider caches after key changes; CRM replacement also removes
pending previews and stops queued workflows/refreshes. CRM previews also carry a
credential fingerprint checked before writes, covering concurrent preview creation
and connection replacement. In-flight requests can
finish when access is revoked; later requests and cron selection reject the
account. Existing owner companion remains owner-scoped; member research uses
personal Parallel/Gemini keys until individual companion onboarding is added.

## 2026-09-07 — Reusable buying-signal research

Use the existing recipe-template and structured research pipeline for four built-in
recipes: sales hiring, recent funding, tools in use, and sales leadership with
operations support. Each research action returns six fields. Map the required
website input and skip empty values before provider calls. Instantiating a recipe
never runs it; the existing run controls and request limits apply.

Keep optional plain-text focus and provider choice with each copied recipe. Save
or export customized templates through the current library. Preserve provider
selection in portable recipe files and enforce the existing 100-column table limit
when adding multi-output recipes. No new credentials, database schema, or service.

Separate observed evidence from sales implications. Hiring announcements use a
90-day default and funding a 180-day default; current role/tool evidence must not
be inferred from stale mentions. Not found is an evidence gap, not proof of absence.
The existing citation/review mechanism applies but does not independently verify
model claims. These recipes are snapshots, not new automatic monitors. The friends
beta remains optional preparation: no email addresses or invitations are required
for the current single-user release.

## 2026-09-07 — Contact provider inventory and LeadMagic adapters

Track Clay's currently documented finders, validators, personal/hashed identifiers,
and conflicting older marketing claims separately. Provider catalog presence is
not proof of inclusion in a particular default waterfall or of direct API access.
Keep documentation-only providers out of runnable presets.

Use current LeadMagic versioned endpoints with existing HTTP waterfall machinery.
Only accept its explicit valid email status; mobile-by-work-email has no documented
verification field and must stay format-only. Configure keys through the existing
per-account vault and local environment. Test mapping, fallthrough, error stops,
and credential isolation using synthetic responses; do not claim live coverage or
billing validation without an account. No migration or new service is required.

## 2026-09-07 — Prepare provider presets before connecting credentials

Keep presets available without an API key so users can build and reuse workflows before choosing a subscription. Saving a preset performs no lookup; execution still resolves credentials in the current account. Findymail finder responses get format-only acceptance because the documented schema has no verification status; its independent verifier requires the returned `verified` boolean. Preserve application errors even when their HTTP status is 200. A small shared preset list drives input requirements and the UI as the provider catalogue grows.

## 2026-09-07 — Explicit contact quality and provider-specific contracts

Use documented synchronous endpoints first and keep finder/validator operations separate. Do not infer phone ownership or reachability from formatting, identity-match likelihood, or an email verification score. Normalize ContactOut's per-address status dictionary and Trestle's national-number response into source-derived `pomade` fields while retaining the raw status. Never treat PDL availability booleans as revealed values. Verification status must remain tied to the chosen result; adding a format-only fallback must not silently loosen an existing verified rule. Asynchronous submission/polling and callback recovery remain their own next vertical slice; no pretend adapters or new accounts are needed for this batch.

## 2026-09-07 — Enrow background submit and result polling

Use the existing row background runner for Enrow, with one account-scoped progress record per job/table/row/action. Cache completed waterfall steps within that job so waiting for a later provider never repeats earlier completed requests. An input/configuration fingerprint rejects changed work instead of silently charging for a different lookup; a new job intentionally starts fresh. Atomic state writes record submission intent before POST. Enrow documents no idempotency key, so a lost submit response without a saved ID requires review rather than resubmission.

Poll the saved ID once per eligible tick, with 15–60 second spacing and a 30-minute automatic wait window. Resume extends waiting on the same ID. No webhook receiver, new queue, SDK, or infrastructure is needed for this slice. Single-pass schedules are rejected before external side effects; background and workbook jobs can wait. Report actual submission credits when returned and zero Enrow credits for result GETs. Phone `found` is not upgraded to a verification claim. Live API/plan validation remains separate from contract tests.

## 2026-09-07 — FullEnrich reuses saved waterfall requests

Share request-state types, pending/error signaling and background detection with Enrow while keeping provider contracts and polling intervals separate. FullEnrich requests one contact and one contact type, saves its ID and an opaque correlation tag, then checks results no more often than every five minutes. Polling works on a local installation without a public callback URL; webhooks remain a later latency improvement. Existing progress records remain compatible; no migration is needed.

Require the saved batch ID and exactly one matching tagged contact before accepting output. Email statuses and phone quality belong to the selected candidate. A broad mobile option permits unknown activity/ownership; the strict option requires mobile type, active status and confirmed ownership. No inferred verification. Record cumulative FullEnrich credit reports as newly observed amounts; submission cost remains unknown until reported. A lost submission outcome stops automatic resubmission, and result failures retain the original ID for review/resume. Single-pass schedules remain unsupported for asynchronous providers.

## 2026-09-07 — Verify candidates and resume scheduled occurrences

Implement the three selected workflow improvements before adding another vendor. Store an optional supported verifier preset on each finder and supply only that finder’s candidate. Verification consumes a separate provider action and its returned status must apply to the same email/phone. Keep pending, rejected and technical failure distinct; preserve all completed background waterfall steps, including synchronous finders before an asynchronous or failed verifier.

Attribute performance using stable per-job/row/column/stage operation IDs. Aggregate the latest 100 sheet run receipts, count repeated polls as result checks, retain vendor-specific observed credit totals and mark unreported cost unknown. Do not invent historical match attribution or infer live coverage from synthetic results.

Replace single-pass scheduled enrichment with existing persisted row jobs. Store the job ID, successful source-refresh checkpoint and frozen recipe/destination configuration on the schedule; queue one occurrence and wait for job completion before captured CRM writes and transfers. A new recurring occurrence gets a new ID. Pause/resume updates both job and schedule; cancellation permits deliberate fresh work. Keep the existing CRM verification and uncertain-outcome review behavior. Add only three run-job columns and upgrade account-scoped schemas; no new queue service, SDK or paid scheduler. This supersedes the earlier Enrow/FullEnrich restriction on asynchronous schedules. Existing local clocks and hosted wakeups remain necessary.

## 2026-09-07 — Preview actual row readiness and extend saved provider polling

Reuse the existing conditions, provider presets and request ceiling in a row/action preview; do not discount the consent maximum using stale conditions. Missing values that an earlier selected recipe may fill are dependencies, not definite failures. The preview checks configured connections without consuming provider credits.

Dropcontact qualification identifies a named work email, so strict verified-email acceptance needs a separate verifier. Its balance cannot establish a per-operation cost. Apollo mobile uses a separate connection from synchronous email so existing email workflows stay synchronous. The phone connection requires a caller-controlled public HTTPS callback URL; a private Sites address is not an eligible receiver. Reuse saved polling state rather than introduce a public relay or change the site's audience. Preserve Apollo request IDs as exact strings and leave provider-native waterfalls off.

The live benchmark exposed an outdated Parallel endpoint/header. Use the current official Chat API path and `x-api-key`; retain the prior failed receipts. Source-linked leadership research is checked against company pages before contact enrichment. Raw contact data and CRM receipts stay in ignored outputs and private tables; the repository report contains aggregate results only.

## 2026-09-07 — Public Apollo acknowledgement with private result polling

The requested callback support supersedes the earlier bring-your-own-receiver-only decision. Deploy a dependency-free acknowledgement Worker from `services/apollo-callback` as a separate public Sites project. Preserve the main Pomade project and its owner-only audience. This uses the existing hosting service, without opening a Mac port, adding a database or buying a provider plan.

The receiver accepts bounded JSON at a separate random-token URL and discards it without application payload logs, storage or forwarding. It holds only a receipt-token digest and cannot access Pomade accounts, tables or CRM credentials. An unsolicited callback cannot change enrichment output. The authenticated Apollo result-polling endpoint remains the source of data, using the saved request/person ID and each account's own key. Polling availability is a concrete requirement, not an optional fallback.

Share only the acknowledgement URL through `POMADE_APOLLO_CALLBACK_URL`; preserve per-user `APOLLO_WEBHOOK_URL` overrides and private API keys. Do not silently replace an invalid custom receiver. The settings test probes only the installation-owned endpoint with empty synthetic data, never user-entered URLs or real contacts. Publish service source separately through a Git subtree export; keep it maintained in this repository and keep GitHub untouched.

The deployed settings check exposed Workers rejecting `redirect: 'error'` despite Node accepting it. Use manual redirects and reject non-2xx responses, matching existing provider requests. Exercise the callback settings action in the compiled Worker test. Hosted builds also enable Cloudflare's documented `global_fetch_strictly_public` flag so same-zone callbacks use the public HTTPS route.

## 2026-09-07 — Make the sheet the main working surface

Group existing controls into Add data, Enrich, Automate and Send shelves, keeping the run button and row controls in view. Shelves keep their builders mounted so opening another tool does not discard a draft. Searchable sheet navigation replaces the long native selector; details and navigation can collapse without reducing workbook capability. Row density is an optional device preference, independent of saved data.

Use Glide's real trailing element for the permanent Add column rail. It is interface chrome, never a saved or exported column. Right-click and the rail open the same searchable picker for ordinary typed fields, formulas, research and provider waterfalls. Preserve the existing execution order: new steps append before run status. Configuration does not trigger provider requests. Newly added columns scroll into view; existing rows and recipe definitions stay intact. Keep both deployment modes and the private hosted audience unchanged.

## 2026-09-07: Focused workbook navigation

- Column visibility is stored on the existing column definition and applies only to the grid. Hidden inputs and recipes remain available to execution, mappings and full-sheet exports. At least one column stays visible; visible drag positions resolve to stable column IDs before existing execution-order checks.
- The searchable catalog derives contact actions from the existing preset registry. Connection badges report configured keys, not verified plan access. Selecting an action opens the existing setup builder without a provider request; research service selection is saved for single, structured and list outputs.
- Related-sheet tabs use the compiled workbook plan's membership and order, resolving only against the current account's available table summaries. Renames use current names. Standalone copies do not inherit the original workbook's tabs; navigation retains existing save/run guards.

## 2026-09-07 night shift: Reliable setup before provider access

Provider drafts can be saved using known presets even when the connection check fails. Custom requests still need a recognized connection. Repeated lookup actions receive distinct bounded IDs and names. Switching between email and phone clears incompatible verifiers; adding a compatible fallback preserves the chain's acceptance rule. Manual CRM refresh uses saved settings rather than cancelled form drafts. An empty CRM preview can be saved as a refresh source while retaining existing rows.

## 2026-09-07 night shift: Previewed CSV imports

Selecting a CSV opens a preview rather than overwriting the active sheet. New sheet is the default; appending requires explicit column mapping and preserves existing rows, recipes and source configuration. File/row/column limits and malformed rows are checked before mutation; new-sheet creation revalidates at the server boundary. CSV Status remains separate from run status. Imports support a 2 MB file, 5,000 rows and 99 CSV fields plus run status. Appends pause an active recipe schedule so new records cannot silently expand external work. Exports use an ordered cell matrix so duplicate display headers and hidden fields do not lose values.

### 2026-09-07 — Visible row actions and explicit CSV exports
- Apply grid cell edits to the latest stored row before recalculating formulas; Glide delivers paste/clear cells before React can refresh row props.
- Current row actions and checkbox selection are bounded to the visible view. A view with no matches has no active record. Saved schedule scopes remain unchanged.
- CSV export defaults to selected rows or the current view, with explicit entire-sheet and hidden-column options. Ordered CSV matrices retain duplicate column titles. Blank-row creation stops at the existing 5,000-row save capacity.
- Verified 27 focused unit tests and eight actual browser checks covering multi-cell paste/clear, filtered actions/details, CSV contents, mobile fit, and reload persistence.
