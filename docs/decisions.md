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
