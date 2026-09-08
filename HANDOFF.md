# Morning Handoff

## Finished

- Foreman’s worker fixed row deletion: stale selected IDs no longer delete unrelated generated rows. Existing selected rows still delete their descendants; schedules and immutable/no-op behavior remain intact.
- A separate read-only reviewer inspected the change and independently passed all required checks. Two synthetic regression tests failed before the fix and passed afterward.
- Rebuilt and restored local Pomade at localhost:8798. All 28 saved sheet snapshots are unchanged.
- Earlier private hosted version **34** remains on source `d79f057`. Research/waterfall settings, filters, row links, receipt search and earlier workbook improvements remain. This local increment has not been deployed or pushed.

## Try It

- Open [local Pomade](http://localhost:8798). [Private hosted Pomade](https://pomade.deleteddeleted.chatgpt.site) retains its separate data and earlier release.
- Run `./node_modules/.bin/vitest run --config vitest.config.ts --configLoader runner --no-cache lib/row-management.test.ts lib/recipe-schedule.test.ts --pool threads`.

## Checks

- 18 focused tests passed; TypeScript (`--noEmit --incremental false`), Oxlint and `git diff --check` passed independently in the reviewer.
- `npm run build` and `npm run build:hosted` passed. Hosted build preserved local `dist/`.
- Local `/` and `/api/providers/http` returned HTTP 200 after startup. No active jobs or enabled schedules existed before startup; hashes of all 28 saved snapshots matched afterward.
- The first review’s default Vitest process pool failed on temporary-file writes. Threads passed in read-only mode; a new review-first run with that acceptance command reached DONE.
- Earlier release’s 58 tests and browser/provider checks are historical and were not rerun for this helper change. Current validation used synthetic tests and HTTP checks; no provider execution or saved-sheet edits.

## Decisions

- Only existing selected rows establish deletion roots; unrelated orphans remain untouched.
- Keep the hosted audience owner-only, and local/hosted data separate.

## Remaining

- The row-deletion correction is local; private hosted version 34 predates it.
- Live Apollo phone enrichment needs eligible access; unconnected adapters need credentials and live coverage.
- Fully unattended hosted timers remain unverified. ChatGPT research needs the Mac helper.

## Review First

- `lib/row-management.ts` and `lib/row-management.test.ts`.
- Foreman reports: `../foreman/runs/20260908T142933Z-946419/report.md` and `../foreman/runs/20260908T143857Z-e5afcd/report.md`.
