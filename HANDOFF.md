# Morning Handoff

## Finished

- Added capture/reuse of one-to-ten-table workbook templates.
- Created empty connected tables with fresh IDs in one database batch.
- Remapped active and saved lookups, function libraries, transfers and schedules.
- Required compatible explicit mappings for outside-table references.
- Paused schedules and removed webhook ingestion/data history from copies.

## Try It

Open **Workbook templates** in the table bar. Select connected tables and save a template. Choose it, name the new workbook, map outside references and create. Add data to the new tables; review paused schedule scope and connections before enabling runs. Test Worker stopped after checks.

## Checks

- 15 focused workbook/template/recipe-template tests passed.
- Typecheck, lint and production build passed.
- Isolated Worker + D1 passed template persistence, empty connected copies, copied lookup/transfer execution and unchanged original tables.
- Missing outside mapping created no tables; explicit mapping and home HTTP 200 passed.
- Diff review/whitespace passed. No browser interaction test, provider calls or deployment.

## Decisions

- Templates are independent local configuration snapshots.
- Outside mappings require matching column IDs; new tables retain their column IDs.
- Empty tables and paused/disconnected automation are the creation defaults.

## Remaining

- Branching workflows and generated-row routing.
- Versioned function rollout and portable workbook export.
- Native provider presets, signals and numeric/grouped aggregations.
- Governed CRM writeback and retained-history controls.
- Self-host packaging, hosted accounts and public release later.

## Review First

- `lib/workbook-template.ts` for deep remapping and capture semantics.
- `app/api/workbook-templates/route.ts` and template UI for creation flow.
- `docs/capability-gap.md` for remaining competitor gaps.
