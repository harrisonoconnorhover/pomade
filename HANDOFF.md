# Morning Handoff

## Finished

- Added manual refresh from the saved HubSpot or Salesforce source, including segment, record type and extra properties.
- Added merge previews for new, updated and unchanged records, with before/after field values.
- Keep records absent from a complete preview; partial previews leave that count unchecked.
- Preserve recipe outputs, run statuses and column order when merging CRM data.
- Recover older import settings where unambiguous and cancel pending reads when the dialog closes.

## Try It

- Open the existing DemandDrive segment sheet locally at http://localhost:8798/?table=65aec481-84b4-416c-a851-b22c8a0ef66d or privately at https://pomade.deleteddeleted.chatgpt.site/?table=63f0fdf0-e791-4ac6-bc0c-bfbfd183e910.
- Choose **Refresh CRM source**, or **Load data → Preview latest**. Load remaining pages, review changes, then **Merge records**.
- See [CRM refresh usage](docs/hubspot-segments.md).

## Checks

- 22 focused tests across three files passed; typecheck, lint and diff whitespace checks passed.
- Local/hosted build and live refresh verification are pending for this source revision.

## Decisions

- Refresh remains an explicit read, review and merge; no automatic membership deletion or enrichment rerun.
- Preserve recipe-owned fields even when a recipe writes to standard email or phone columns.
- Reuse the existing CRM importer and native-ID matching; no new background infrastructure.

## Remaining

- Complete local/hosted builds and live verification.
- Scheduled CRM refresh, a property picker and automatic Salesforce token renewal remain future work.
- Mobile coverage and per-run cost estimates remain the most useful enrichment improvements.

## Review First

- `lib/crm-import.ts`: settings recovery, change summary and merge preservation.
- `components/crm-import-review.tsx` and the saved-source controls in `components/pomade-workspace.tsx`.
- `lib/crm-import.test.ts`: preservation, empty/partial previews and cross-CRM identities.
