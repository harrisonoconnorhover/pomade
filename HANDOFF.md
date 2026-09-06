# Morning Handoff

## Finished

- Added **Build from a prompt**: paste a brief, review an AI plan, and create linked sheets with research columns, scoring and transfers.
- Added an ordered run guide to generated sheets. Research and transfer steps use the existing runners.
- Added a local 100-point rubric that holds missing or invalid evidence for review.
- Added text-only ChatGPT planning through the local helper and hosted companion queue.
- Created the real ChatGPT DemandDrive plan locally: Request, Accounts and Buyer Committee; 63 columns total.

## Try It

- Open [the local example](http://localhost:8798/?table=plan_8d5f4538-b463-4193-a677-9c798a2ad155_requests), or choose **Build from a prompt → Use DemandDrive example → Plan workbook**.
- Review and create the proposed sheets. Use **Run step**, then **Preview route → Transfer matching rows**, and open the next sheet from its guide.
- Keep the ChatGPT helper running for local planning, and the Mac companion for hosted planning. See [the feature guide](docs/prompt-to-workbook.md).

## Checks

- Typecheck and lint passed. The focused 73-test suite passed; the final planner/helper/queue check passed all 18 tests after normalization changes.
- Local and hosted production builds passed. Diff whitespace checks passed. Browser visual QA was not run.
- Real ChatGPT planning returned a valid three-sheet plan in 137 seconds. Local API readback verified the original brief, blank research rows, saved routes, safe creation replay and unchanged existing table summaries.
- The additive queue migration passed against the SQLite test fixture. Private deployment and hosted verification are next.

## Decisions

- ChatGPT plans the workbook in text-only mode; later research uses the installation's normal provider.
- Compile supported steps into existing Pomade columns and routes; keep CRM, enrichment and presentation tasks visible as separate work.
- Create a new workbook and require the usual run controls for subsequent research and transfers.

## Remaining

- Finish private deployment and verify hosted planning and workbook creation.
- The plan guides execution one step at a time; unattended execution across every sheet is future work.
- Direct CRM/enrichment configuration from the brief and editing the proposed plan in place remain future improvements.

## Review First

- `components/workbook-prompt-builder.tsx` and `components/workbook-plan-guide.tsx`.
- `lib/workbook-planner.ts` and `app/api/workbook-plans/route.ts`.
- `docs/prompt-to-workbook.md` and the local example.
