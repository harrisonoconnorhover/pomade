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
adapter. Future CRM mutation must go through GTM Control Tower's preview,
approval, receipt, and rollback boundary.

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

## CRM sources are read-only

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

## CRM mappings terminate at a Control Tower preview

Pomade suggests a small portable contact schema from column IDs and titles, but
the operator chooses the final mapping and whether the destination is a HubSpot
Contact or Salesforce Lead. The downloaded plan contains only mapped columns,
records both the portable Control Tower field and provider-native destination
names, caps the preview at 100 rows, and explicitly disallows creates.

Pomade still performs no CRM write. GTM Control Tower remains responsible for
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
