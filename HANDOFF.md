# Morning Handoff

## Finished

- Added **Run workbook** with linked-sheet progress, pause/resume/cancel, scoped routing, request limits, and saved checkpoints. The three-company workflow completed locally and on the private website.
- Added saved CRM source refresh, daily/weekly schedules, membership labels, and Salesforce session renewal. Live refresh returned three HubSpot segment contacts and 17 Salesforce dev-account companies.
- Added Prospeo verified-mobile presets and provider balance cards. Three contact lookups found one verified mobile; 90 free Prospeo credits remain. Results are in both installations.
- Added per-column ChatGPT/Parallel/Gemini selection and fixed Parallel structured-list responses.
- Improved the compact workbook guide, linked-sheet navigation, refresh controls, and provider settings. Local startup includes the scheduler; authenticated website polling and the existing Mac companion also wake hosted work.

## Try It

- Open the [hosted assignment accounts](https://pomade.deleteddeleted.chatgpt.site/?table=plan_1e1de86e-67ad-4871-b0b8-42702c08874f_accounts) or [local workbook](http://localhost:8798/?table=plan_8d5f4538-b463-4193-a677-9c798a2ad155_requests). Expand **Steps and linked sheets** to navigate the run.
- On CRM-imported sheets, use **Refresh now** or **Refresh settings**. Use **Provider presets → Prospeo · verified mobile**, and **Research with** in column settings.
- `npm start -- --port 8798` starts the local server and scheduler. The existing ChatGPT helper and hosted companion remain running.

## Checks

- 62 distinct focused tests passed, plus typecheck, lint, local/hosted builds, script syntax, and diff whitespace checks. Browser visual QA was not performed.
- Live hosted pause/resume preserved the same job and request reservation. Automatic hosted CRM refreshes completed and saved their next daily times. Salesforce renewal passed with an expired access token.
- Both workbook runs finished with three accounts held for Review and zero released buyer rows. Completion means processing finished, not that research claims are independently verified.
- Private release is owner-only. Detailed private results are ignored under `outputs/workflow-polish/`.

## Decisions

- Reuse existing queues and CRM identities; preserve enrichment and departed source records.
- Daily refresh is enabled only for the two hosted dev CRM sheets. Local copies remain manual.
- Use existing free allowances and saved account authorizations; no purchases, topups, outreach, public publishing, or GitHub pushes.

## Remaining

- Hosted automatic work needs Pomade open or the Mac companion active. Missed refreshes catch up; native unattended Sites timers were not observed.
- Review research evidence and resolve the three accounts' qualification gaps before using results for outreach.
- Brief-to-CRM setup, native sequence enrollment, and broader provider coverage remain separate improvements.

## Review First

- `db/workbook-runner.ts` and `lib/workbook-run.test.ts`.
- `lib/crm-refresh.ts`, `lib/salesforce-auth.ts`, and their tests.
- `worker.ts`, `components/workbook-plan-guide.tsx`, and `components/crm-refresh-panel.tsx`.
