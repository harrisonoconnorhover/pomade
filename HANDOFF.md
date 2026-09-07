# Morning Handoff

## Finished

- Added four built-in recipes: sales team hiring, recent funding, tools they use, and sales leadership with operations support.
- Each adds six structured outputs from one research action per eligible row, including assessment, details, sources, evidence, and a separate sales hypothesis.
- Added optional research focus and provider choice. Customized copies can be saved, exported, imported, and mapped to another sheet.
- Preserved blank unknown facts and citation review behavior; mapped website conditions skip empty rows. Recipe insertion now respects the 100-column table limit.
- Clarified that the existing friends beta is optional preparation. Pomade stays owner-only; no friend emails or invitations are needed now.

## Try It

- Open [Pomade](https://pomade.deleteddeleted.chatgpt.site) or http://localhost:8798 → **Recipe library → Buying-signal research → Use**.
- Map the company website, optionally choose a provider/focus, then run from the new column menu. Adding the recipe alone spends no research credits.
- Edit column settings and **Save template** for a reusable variant. The README's “Research buying signals” section explains evidence and date defaults.

## Checks

- 24 focused recipe/template/portable-file/function tests passed, including mapped skips, four-action execution, stale-value clearing, and export/import.
- Typecheck and lint passed. Local/hosted builds and private deployment are the remaining release checks.
- No browser visual QA or live provider research has been performed for these four new prompts.

## Decisions

- Reuse existing structured research and templates; no new service, migration, or account is needed.
- Hiring announcements default to 90 days and recent funding to 180 days. A focus can narrow the search; observations remain separate from sales hypotheses.
- Keep Sites ChatGPT sign-in, owner-only access, and local operation. No direct Google signup or GitHub publishing in this slice.

## Remaining

- Complete local/hosted release checks and private publication.
- Assess real answer quality on chosen companies when using the recipes. Citations and structure checks do not independently prove claims.
- Friend sign-in and personal companion onboarding remain future work when someone wants access. These recipes do not add automatic monitoring.

## Review First

- `lib/research-recipes.ts` and `lib/research-recipes.test.ts`.
- `components/pomade-workspace.tsx`, `lib/recipe-file.ts`, and `lib/recipe-templates.ts`.
- README usage notes and `docs/decisions.md`.
