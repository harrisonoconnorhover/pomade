# Morning Handoff

## Finished

- Added a workbook table selector, blank-table creation and duplication, preserving the original table.
- Added selected-row copies into a new table with source-record links and static upstream values.
- Scoped workspace saves, versions, receipts and job polling to the active table; background execution works on new tables.
- Serialized autosaves, waited for pending saves before server mutations, locked editing during foreground writes, and added failed-save retry. Failed loads cannot overwrite saved data with a sample fallback.
- Reordered the roadmap around personal daily usability; sign-in, billing and public onboarding are deferred.

## Try It

Run `npm run dev` from this folder and open the printed URL. Use **Tables**, **New table**, or **Duplicate** above the grid. Select rows and choose **Action → Send selected rows to new table**; use the inspector's **Source** button to return to the original row. Runs and version history belong to the selected table. Preview/test servers were stopped after checks.

## Checks

- 13 focused tests passed across workbook, workspace-version, row-management and run-job tests.
- Final typecheck, lint and production build passed.
- Isolated Worker + temporary D1 API workflow passed: create/edit/run, linked copy, duplication, independent histories, rejected cross-table restore, non-default-table background completion, and unchanged original table.
- Installed Miniflare uses `/cdn-cgi/local/scheduled` for scheduled testing; the first `/__scheduled` attempt returned 404, then the existing job completed through the correct endpoint.
- Local page returned HTTP 200; diff check passed. No browser interaction test or paid provider call.

## Decisions

- Use the existing per-workspace execution contract for each table; no new authentication or runtime migration.
- Selected-row transfers copy values and source links; they do not sync future edits or rerun upstream recipes. Duplicates have no active schedule.
- Keep the broad Clay/Bitscale competitor goal active; local commits only, no GitHub push or site publication.

## Remaining

- Next: cross-table lookups with explicit missing/duplicate-match behavior, then repeatable transfers and workbook templates.
- Generic HTTP enrichment and authenticated webhooks.
- True sequential provider fallback, with per-attempt receipts and usage.
- Additional sources, signals, multi-step reusable functions and governed CRM writeback.
- Later: independently packaged self-hosting, account isolation, Google sign-in and public release.

## Review First

- `components/pomade-workspace.tsx` for scoped loading, save ordering and navigation readiness.
- `lib/workbook.ts`, its tests, and `app/api/tables/route.ts` for table creation/copy semantics.
- `docs/capability-gap.md` for the usability-first build order and remaining parity gaps.
