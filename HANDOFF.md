# Morning Handoff

## Finished

- Added sequential fallback across two-to-four configured HTTP providers with stop-on-success and explicit technical-error policy.
- Added nonempty/email-format acceptance, winner/status columns and stale-value clearing.
- Added visible per-attempt receipts, actual-attempt usage and weighted request caps.
- Integrated fallback with manual/background/scheduled execution, templates and input dependencies.
- Fixed the unsaved-row execution merge conflict found by real Worker testing.

## Try It

Run `npm run dev`, open **Recipe library → Provider waterfall**, configure provider steps and add the recipe. Run its column and confirm the maximum requests. Inspect the winning-provider column and expand provider attempts in the receipt. For local background work, use the built Worker plus `npm run clock` as documented in README. Verification servers were stopped.

## Checks

- 145 full-suite tests passed; final focused fallback/merge/pipeline suite: 14 passed.
- Final typecheck, lint and production build passed.
- Isolated Worker + D1 + fixture providers passed first-hit suppression, miss fallback, weighted caps, error stop/continuation, stale clearing, downstream formulas and durable attempts.
- Background/scheduled execution and home HTTP 200 passed; final diff whitespace check passed.
- No browser interaction test, paid provider calls or public deployment.

## Decisions

- A logical waterfall action can contain several billable attempts; show both counts honestly.
- Email format is not deliverability verification. Native provider presets remain separate work.
- Keep the full competitor goal active and commit locally only.

## Remaining

- Repeatable table transfer/update rules and richer relationships.
- Native provider presets and richer acceptance predicates.
- Scheduled sources, signals and reusable multi-step functions.
- Governed CRM writeback and retained-history controls.
- Independent self-host packaging, accounts, Google sign-in and public release later.

## Review First

- `lib/provider-waterfall.ts` and tests for acceptance and request suppression.
- `lib/external-recipes.ts`, usage summary and recipe route for counts and execution.
- `components/provider-waterfall-builder.tsx` and run receipts for configuration and evidence.
