# Morning Handoff

## Finished

- Added **Run workbook** with linked-sheet progress, pause/resume/cancel, scoped routing, request limits, and saved checkpoints.
- Added saved CRM source refresh, daily/weekly schedules, complete/partial membership labels, and Salesforce session renewal.
- Added Prospeo verified-mobile presets and private provider balance cards. The live three-contact test found one verified mobile; 90 Prospeo credits remain.
- Added per-column ChatGPT/Parallel/Gemini selection and fixed Parallel list output compatibility.
- Made the local scheduler start with Pomade and kept the workbook controls compact above the grid.

## Try It

- Open [Pomade](https://pomade.deleteddeleted.chatgpt.site) or the [local assignment workbook](http://localhost:8798/?table=plan_8d5f4538-b463-4193-a677-9c798a2ad155_requests). Use **Run workbook**, then expand **Steps and linked sheets**.
- On a CRM-imported sheet, use **Refresh now** or **Refresh settings**. In **Provider presets**, choose **Prospeo · verified mobile**. In column settings, choose **Research with**.
- `npm start -- --port 8798` now starts the server and scheduler together. ChatGPT research still needs the existing helper/companion.

## Checks

- 60 focused tests, typecheck, lint, local build, hosted build, and diff whitespace checks passed. No browser visual QA was performed.
- Live Prospeo lookup, provider balances, HubSpot segment refresh, and Salesforce token-renewal request passed. Final Worker CRM checks and private release checks are being recorded in ignored `outputs/workflow-polish/`.
- Mixed ChatGPT/Parallel workbook execution researched and routed all three named accounts. Qualification research is still running; insufficient evidence remains Review.

## Decisions

- Reuse the row job queue; commit routes and cursors together. Keep unrelated destination rows outside the run.
- Preserve CRM rows and enrichment; source absence requires complete pagination. Refresh schedules are opt-in and separate per installation.
- Use existing free allowances and the saved Salesforce authorization. No purchases, topups, public publishing, outreach, or GitHub pushes.

## Remaining

- Finish the private deployment and final live checks.
- Brief-to-CRM configuration, native sequence enrollment, broader provider coverage, and factual research quality remain separate improvements.

## Review First

- `db/workbook-runner.ts` and `lib/workbook-run.test.ts`.
- `lib/crm-refresh.ts`, `lib/salesforce-auth.ts`, and their focused tests.
- `components/workbook-plan-guide.tsx` and `components/crm-refresh-panel.tsx`.
