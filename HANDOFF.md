# Morning Handoff

## Finished

- Actual input edits now reset the row to Draft while preserving prior values until rerun; unchanged edits do nothing.
- Local formula review outcomes now prevent a passing row. Clearing a person's name yields two review actions and a Review row.
- Record-detail links correctly handle supplied HTTP(S) URLs, uppercase schemes, bare domains and surrounding whitespace.
- The existing three-row walkthrough now includes edit, rerun and missing-person checks. No providers or product features were added.
- Runtime commits `1560dba` and `025ce35` are published with documentation at `caf5e03`, and mirrored into development as `d9475d3` and `6611e9d`, preserving unpublished work.

## Try It

1. Follow [local setup](README.md#run-locally) and [the synthetic workflow](docs/portfolio-workflow.md). Run the three rows: nine local actions, two passing rows and one Review row.
2. Clear the first person's name: the row becomes Draft. Run its recipes: First name and Contact key need review, and the row stays Review.
3. Clear a previously checked website, export CSV before rerunning, and inspect `Run status=Draft`. Prior formula values remain visible but do not retain passing status.

## Checks

- 54 focused tests across seven suites, typecheck, lint and diff checks passed in public and development trees.
- Public local and hosted builds passed after both runtime changes; existing chunk-size warnings remain. Four synthetic checks of the actual website-link expression passed.
- Fresh isolated browser/storage: three-row run, input edit to Draft, missing-person rerun to Review, one-pass/two-review receipt and actual CSV export passed. Export retained old Birch outputs with Draft and Aster with Review.
- Independent clean-source installation used `npm ci --legacy-peer-deps --ignore-scripts`; its dev server then started and initialized the disposable local database successfully. No provider credentials or scheduler were used.
- Public repository has no configured GitHub Actions workflow; these are local checks, not a CI claim.
- Remote main and commit-pinned public downloads were verified; all three changed runtime files byte-match the reviewed release. Browser inspection confirmed the corrected full website href without visiting it.

## Decisions

- Keep earlier values and receipts inspectable while invalidating stale row status.
- Row status must reconcile with action results.
- Separate public source publication from private hosted deployment; preserve saved sheets and unrelated development.

## Remaining

- No required work remains in this correction pass.
- Private hosted/runtime deployments and historical provider benchmarks are unchanged; no live research, CRM writes or scheduled jobs were exercised.

## Review First

- `lib/grid-edits.ts` and `lib/local-recipe-engine.ts`, plus their focused regressions.
- `components/pomade-workspace.tsx`: record-detail website href.
- `docs/portfolio-workflow.md`: the reproducible failure case.
