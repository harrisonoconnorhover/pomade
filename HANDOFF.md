# Morning Handoff

## Finished

- Find → verify → fallback now fits inside one waterfall. Each finder can use an existing email verifier or Trestle phone validator; pending results hold later steps, rejected candidates fall back, and saved finders are reused on resume.
- Added per-sheet provider performance in Run history: accepted and extra fallback matches, lookup/verification counts, waiting/errors, elapsed time and observed credits. Polls/reused steps do not inflate matches; unknown costs remain unknown.
- Schedules now queue durable jobs, retain completed source refreshes, and wait for enrichment before CRM writes and transfers. Recurring occurrences get fresh IDs.
- Background runs shows waiting and next-check time, Resume saved run, Finish scheduled steps and Cancel run. Interrupted post-run work reuses completed enrichment/CRM batches. Unexecuted stale CRM previews refresh safely before confirmation.

## Try It

In **Provider waterfall**, choose a finder and its **Verify this result before accepting it** option. Connect the required keys before running. Use **Run history → Provider performance** to compare observed results. Schedule the workflow normally; manage waiting, pause/resume and cancellation in **Background runs**. A new run deliberately makes fresh lookups.

## Checks

- 244 focused tests passed across 15 files; the 20 waterfall tests passed again after correcting the winning-result label. TypeScript, lint and diff checks passed.
- Built Worker/D1 tests passed for scheduled source import, inline asynchronous verification, fallback, restart/resume, simulated HubSpot write/readback, transfer recovery, reporting, cancellation and fresh runs. Existing FullEnrich and Enrow restart exercises passed. All outbound traffic intercepted.
- Compiled account test passed: owner plus three synthetic friends, separate keys/data, and the new performance endpoint cannot expose another account’s results.
- Local build passed and is running at `http://localhost:8798`. Private Sites version 24 is live at `https://pomade.deleteddeleted.chatgpt.site` from runtime commit `096cd5a`; owner-only access and environment revision 8 are unchanged.
- Final HTTP checks passed; the served feature bundle matches the packaged build. All 19 local and 11 hosted table row/column counts and configured connection IDs, including seven hosted connections, match the baseline.

## Decisions

- Reuse existing verifiers and row jobs; add three run-job columns and update per-account schema version. No new service or provider subscription.
- Up to four finders plus optional verifiers; scheduled budgets include both stages and possible source additions. Frozen recipe/destination settings must match when resuming.
- Provider credits are vendor-specific observations. Synthetic tests do not establish live coverage, entitlement or billing accuracy.

## Remaining

- Live provider comparison using connected keys and a small repeatable dataset.
- Fifteen core providers remain; Dropcontact is next. This change adds workflow capabilities, not another vendor.
- Local server/clock or hosted wakeups must run. Ambiguous provider submissions and uncertain CRM writes still need native-result review.

## Review First

- `lib/provider-waterfall.ts` and `lib/provider-performance.ts`.
- `db/schedule-runner.ts`, `db/run-job-control.ts` and `db/scheduled-crm.ts`.
- `scripts/test-workflow-worker.mjs` and the three new focused test files.
