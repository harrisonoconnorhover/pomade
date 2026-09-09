# Morning Handoff

## Finished

- New **Personal opener** columns use the existing web-research engine with an editable prompt, provider selection and mapped inputs. Four outputs hold the draft, supporting evidence, source URL and assessment.
- The default prompt requests a specific supported company fact and a blank opener with an explanation when evidence is insufficient. Existing citations and run receipts remain available for review.
- Adding a recipe creates blank columns with auto-run disabled. Legacy `write-opener` columns retain their values and generic local behavior; settings offer **Add researched opener** as a separate, deliberate action.
- Local Pomade is rebuilt and running at localhost:8798. All 28 saved sheet snapshots are unchanged. No hosted deployment, GitHub push, provider execution or CRM write occurred.

## Try It

1. Open [local Pomade](http://localhost:8798), then **Add column → Personal opener**.
2. Choose the provider, map the company website and optionally customize the prompt/focus. **Add function** creates four blank outputs; it does not run research.
3. Check provider access and row scope before running. Review evidence and citations before using the draft. Save the configured column as a template to reuse it.

## Checks

- 21 focused Vitest tests passed across personal opener, research recipes, recipe templates and recipe-file exchange; typecheck, lint and `git diff --check` passed.
- Local and hosted builds passed. The hosted build preserved local `dist/`; neither build was deployed.
- Seven disposable browser checks passed: discovery, cancel, required mapping, custom prompt/provider persistence, four-output creation without execution, 390px layout and deliberate legacy adoption. Desktop/mobile screenshots reviewed; zero page errors or real writes.
- Full before/after hashes matched for all 28 saved sheets. No active local jobs or enabled schedules existed during restart/checks.

## Decisions

- Reuse the existing research and template paths; no new integrations or dependencies.
- Preserve legacy execution; never turn a saved local shortcut into a provider call silently.
- Synthetic responses verify wiring and missing-evidence handling, not live research accuracy. The prompt's factual assessment still needs human source review.

## Remaining

- Hosted version 34 (`d79f057`) predates this increment and the earlier local row-deletion correction.
- Live provider accuracy and account entitlement were not tested in this slice.
- Company summary, demo ICP shortcut replacement and CRM deal notes remain separate work.

## Review First

- `lib/research-recipes.ts` and `lib/personal-opener.test.ts`.
- Personal opener setup and legacy adoption in `components/pomade-workspace.tsx`.
- `scripts/test-personal-opener-ui.mjs`; local artifacts under ignored `outputs/personal-opener/`.
