# Morning Handoff

## Finished

- Added versioned recipe JSON export/import to the recipe library, using existing input mapping and execution paths.
- Preserved formula, research, typed list output, condition, and waterfall configuration across installations.
- Imported files add fresh library entries without executing recipes or replacing table rows; invalid files show feedback inside the library.
- Refreshed Clay/Bitscale capability targets, distinguishing single-column templates from multi-step functions and value selection from provider fallback.
- Recorded one open-source core with optional hosted accounts, Google sign-in after account isolation, and local-only commits during building.

## Try It

From this folder run `npm run dev`, open the printed URL, save a configured recipe as a template, and open **Recipe library**. Use its download icon, then **Import recipe file**. Click **Use**, map inputs, and add the recipe. Imported research still needs provider configuration and execution confirmation. The preview server used during verification was stopped after the check.

## Checks

- Focused recipe-file and existing template tests: 12 passed across two files, including cross-table execution, research/list and waterfall preservation, and invalid-file rejection.
- Final `npm run typecheck`, `npm run lint`, and `npm run build`: passed.
- Local page request: HTTP 200; no browser interaction test or paid provider call performed.
- `git diff --check`: passed before commit.

## Decisions

- Version 1 recipe files contain configuration, not rows, secrets, history, schedules, or existing-column list projections. Literal prompt text remains and should be reviewed before sharing.
- Keep current Workers/D1 runtime while building; complete independent self-host packaging remains a delivery milestone.
- Local Git commits preserve work; no GitHub push or site publication for this iteration.

## Remaining

- Account-scoped storage and authorization, then Google sign-in; current fixed-workspace API is not multi-user ready.
- Multiple related tables and workbook templates.
- True sequential provider fallback, HTTP integrations and authenticated webhooks.
- Governed CRM writeback, additional sources, signals and multi-step functions.
- Standalone self-host packaging and an eventual reviewed public release.

## Review First

- `lib/recipe-file.ts` and its focused tests for the portable format and remapping.
- `components/pomade-workspace.tsx` for recipe library import/export.
- `docs/capability-gap.md` and `docs/decisions.md` for build order and hosting direction.
