# Morning Handoff

## Finished

- Polished column discovery, provider setup, mobile builders, formula input search and research drafts. Improved phone grid scrolling. Added clear capacity checks for the existing 100-column limit, including multi-output actions.
- Added CSV preview with a new-sheet default and mapped append, explicit export scope/hidden-column choices, and correct multi-cell paste/clear behavior with filters and formulas.
- Added selectable run actions, consistent request ceilings, recovery from unavailable history/providers, and protection for edits arriving during job polling or CRM refresh.
- Improved CRM mapping and verified-result review. Created one synthetic company in each existing HubSpot/Salesforce dev account and independently read back the record and custom fields. Verified a real local table transfer and lookup; improved matching defaults, reload/retry states and mobile controls.
- Released runtime `41e0d54` as private hosted version 32 and left the same local build running at http://localhost:8798. Deferred optional CSV/planner code; the workbook entry is 25.3% smaller compressed. Added `docs/workbook-quick-start.md` and corrected refresh/scheduling instructions.

## Try It

- Right-click the grid or use the far-right **Add column** rail. Try AI research, switch its output format, and inspect **Columns** search. Setup alone does not run enrichment.
- Use **Load data** to preview CSV/CRM inputs. Check rows or filter, then review Run actions; use **More → Export CSV** to select exactly what to download.
- Use **Send → Transfer to table**, **Add column → Lookup another table**, or **Send → Write to CRM**. The local **Night shift QA CRM round trip** sheet holds the verified synthetic examples. Saved CRM sources expose **Refresh settings**.

## Checks

- 118 focused tests across 18 files passed; the final lookup checks also passed. Typecheck, lint, diff checks, and both production builds passed.
- Actual browser checks covered imports/exports, paste, run scope, failure recovery, research drafts, capacity, formula search, CRM previews/readback, transfers and lookups. Desktop, tablet and 390px layouts were inspected. Final hosted verification passed: nine checks, zero saved writes or page errors. Refreshed stale local font cache; the local browser now loads font assets correctly.
- Release checks confirmed all 24 original local and 16 hosted sheets preserved; four additional local QA sheets remain. All saved content matched the pre-release snapshot, seven hosted connections remained configured, six served assets per installation matched builds, anonymous access returned 401, and the public callback health check passed.

## Decisions

- The hosted audience remains exactly one owner; local and hosted data remain separate. No GitHub push, purchases, or access expansion.
- Provider setup tests used synthetic responses; real CRM writes were limited to the two labeled dev-account records.

## Remaining

- Real Apollo phone enrichment still needs eligible API access. Other unconnected provider adapters need live credentials and coverage testing.
- Fully unattended hosted timers remain unverified; open-site/companion wakeups work. ChatGPT research needs the Mac helper.

## Review First

- `docs/workbook-quick-start.md` and the four local QA sheets.
- `components/pomade-workspace.tsx`, lookup/transfer/CRM builders and `app/workspace.css`.
- Ignored evidence in `outputs/nightshift/2026-09-07/`; browser scripts in `scripts/test-*-ui.mjs`.
