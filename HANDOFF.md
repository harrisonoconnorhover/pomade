# Morning Handoff

## Finished

- Added named field watches with optional blank-change suppression.
- Recorded observed recipe, scheduled refresh and transfer changes atomically.
- Added row-linked before/after signal inbox and batch review controls.
- Added older-batch pagination and explicit detail/truncation limits.
- Suppressed new-row baselines, unchanged reruns and unrelated manual edits.

## Try It

Open **Change signals**, add a watch under **Watched fields**, then run or schedule a workflow that changes an existing row. Refresh the inbox, open its row link and mark the batch reviewed. Keep the Worker and clock running for scheduled refreshes. Test Worker and fake API stopped after checks.

## Checks

- 21 focused signal, API-source and transfer tests passed.
- Typecheck, lint and production build passed.
- Isolated Worker + D1 with a fake API passed refresh/recipe/transfer signals, baseline handling and unchanged-run suppression.
- Review state, workspace-scoped updates, 23-batch cursor pagination, manual-input exclusion and home HTTP 200 passed.
- Diff review/whitespace passed. No browser interaction test, real provider calls or deployment.

## Decisions

- Signals report observed field changes, not independently verified external events.
- First 200 details per operation; additional changes counted, long values marked.
- Review state is per batch; no outbound notifications.

## Remaining

- Native provider presets and dedicated external-event monitors.
- Numeric/grouped aggregations and richer formulas.
- Structural function migration and bulk rollout.
- Governed CRM writeback and portable workbook export.
- Self-host packaging, hosted accounts and public release later.

## Review First

- `lib/change-signals.ts` and `db/signal-store.ts` for scope and persistence.
- `components/change-signals.tsx` and signal API for inbox behavior.
- `docs/capability-gap.md` for remaining competitor gaps.
