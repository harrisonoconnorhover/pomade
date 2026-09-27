# Morning Handoff

## Finished

- Domain formulas now share the existing URL normalizer. Query strings and fragments no longer create different domain/contact identities.
- Dedupe key and Email domain treat whitespace-only primary emails as missing and use the existing supplied fallback; nonblank primary values retain precedence.
- Earlier corrections remain: edits invalidate passing status, formula review outcomes reconcile with rows, and record-detail website links preserve supplied schemes.
- Runtime correction `c770e12` is in the public-source checkout and mirrored into development as `0c361a0`, preserving unrelated unpublished features. No new providers, dependencies or product features were added.
- The workflow documents these identity cases and their limits. Private hosted/runtime deployments are unchanged.

## Try It

1. Follow [local setup](README.md#run-locally) and [the synthetic workflow](docs/portfolio-workflow.md). Run the three rows: nine local actions, two passing rows and one Review row.
2. Replace Aster's website with `https://www.aster.example?utm_source=email` or `https://www.aster.example#team`; rerun for domain `aster.example` and key `person:maya chen|aster.example`.
3. Run `npm test -- lib/local-recipe-engine.test.ts` for URL identity, whitespace-email fallback and nonblank-primary precedence regressions.

## Checks

- 78 focused tests across nine suites, typecheck, lint and diff checks passed in public and development trees after the formula corrections.
- Public local and hosted builds passed; existing chunk-size warnings remain. Final documentation received focused text/diff checks only.
- Synthetic CSV import/export/reimport preserved quoted and multiline values, duplicate-header values, zero/false strings, blanks and imported statuses.
- Earlier clean-source setup passed the exact README commands with install scripts enabled. Its isolated API run returned nine local actions, two passing rows and one Review row; repeat output matched. No credentials or scheduler were used.
- Earlier isolated browser checks covered edit-to-Draft, missing-person review, actual CSV export and website hrefs. The new formula edge cases were verified in tests. These are local checks, not GitHub CI or live-provider claims.

## Decisions

- Reuse existing domain normalization rather than maintain conflicting identity rules.
- Choose supplied email values after trimming; this does not establish validity or deliverability.
- Separate public source publication from private hosted deployment; preserve saved sheets and unrelated development.

## Remaining

- Private hosted/runtime deployments and historical provider benchmarks are unchanged; no live research, CRM writes or scheduled jobs were exercised.

## Review First

- `lib/local-recipe-engine.ts` and its focused regressions.
- `docs/portfolio-workflow.md`: reproducible identity and failure cases.
