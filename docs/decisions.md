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

The first Claygent-style slice uses the Gemini Interactions API with its native
Google Search tool. The API key stays in ignored local environment configuration
or a hosted secret; it is never sent to the browser or stored in a workspace.
Each result keeps the answer, search queries, and clickable source citations.

Research runs require an explicit confirmation because Gemini can issue multiple
billable searches for one prompt. Pomade caps a run at ten row-column requests
and caches identical model-and-prompt results for 24 hours. External page text
is treated as evidence rather than instructions, and ungrounded answers are held
for review.
