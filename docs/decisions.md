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

The hosted runner supports safe deterministic recipes and records zero external
writes. Scoutbound's richer HTTP, waterfall, AI, script, and command execution
belongs behind a self-hosted worker adapter. Future CRM mutation must go through
GTM Control Tower's preview, approval, receipt, and rollback boundary.
