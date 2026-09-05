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
