# Morning Handoff

## Finished

- Added numeric qualification with AND/OR groups to recipe execution and table routing.
- Added a shared rule editor and numeric saved-view filters.
- Preserved compound rules through saved/portable recipes and protected every condition input from deletion.
- Recorded the requested enrichment, signal, research and CRM workflows as the active acceptance checklist.

## Try It

In recipe settings choose **Run only when** → **Add rule**. Set Employees **is greater than** 50, add Fit **equals** High, and choose **All rules (AND)**. Table routing supports the same editor. The next local build includes these controls.

## Checks

- 39 tests passed across qualification, pipeline, recipes, routing, saved views and column dependencies.
- The provider-dispatch test sent one request for four rows and skipped the three unqualified rows.
- Typecheck, lint and production build passed.
- No browser interaction or live-provider check for this change.

## Decisions

- Keep single-rule files compatible and limit groups to eight flat rules.
- Blank, ranges and nonnumeric text do not pass numeric qualification.
- Continue local iteration without publishing to GitHub.

## Remaining

- Verified email/phone waterfall presets and live provider access.
- Rich company data and source-backed buying signals.
- Custom CRM properties, scores/tags and automatic orchestration.
- Additional model endpoints and source extraction improvements.
- Account-gated intent feeds and self-host/hosted packaging.

## Review First

- `lib/run-conditions.ts` and `lib/run-conditions.test.ts`.
- `components/run-condition-editor.tsx`.
- `docs/requested-workflows.md`.
