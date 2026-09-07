# Morning Handoff

## Finished

- Reorganized the sheet controls into Add data, Enrich, Automate and Send. The run button and row controls stay visible; existing builders and CRM callbacks retain their behavior.
- Added a searchable sheet switcher with Cmd/Ctrl+K, collapsible navigation and record details, optional compact rows, clearer save notifications and useful empty states.
- Added a permanent Add column rail at the right edge, plus a right-click menu. Both open the searchable picker for data fields, email/phone waterfalls, AI research, formulas and reusable recipes.
- Added named text, number, date and true/false fields. New columns scroll into view; the rail never becomes saved data or appears in exports.

- Released hosted version 28 (`43d642c`) to the existing owner-private site. Local http://localhost:8798 is running with the same update.

## Try It

- Open Pomade, right-click a cell/header and choose **Add column**, or use the permanent button on the right. Choose the next step, configure it and run when ready.
- Use **Cmd/Ctrl+K** to switch sheets. Open **Enrich** for provider presets and research, or **Send** for CRM actions.
- Toggle **Details** to inspect a record, and the adjacent density button for more compact rows.

## Checks

- 23 focused tests passed for column creation, workbook behavior, saved views, column management and run previews.
- Typecheck, lint, diff checks, and both local/hosted production builds passed. A source structure check confirmed all 12 existing workflow/provider/CRM/data builder instances remain.
- Live checks passed: 24 local and 16 hosted table IDs preserved, seven hosted connections preserved, Apollo managed callback still configured, and anonymous workbook requests return 401.
- Four JavaScript/CSS assets per deployment match their respective builds. Local root returned 200. Evidence is in ignored `outputs/ui-polish/2026-09-07/release-check.json`.
- No browser interaction or visual QA was performed; these checks verify code and delivery, not the visual result.

## Decisions

- Append new steps before run status to preserve recipe execution order. Creating an action does not spend provider credits.
- Use the grid's native trailing element for the placeholder and keep existing builder drafts mounted inside tool shelves.
- Preserve local data, hosted accounts and the owner-private website audience.

## Remaining

- Real Apollo phone enrichment still requires eligible API access; the public callback service remains separate and unchanged.

## Review First

- `components/pomade-data-grid.tsx` and `lib/grid-columns.ts`.
- `components/pomade-workspace.tsx` and `components/sheet-switcher.tsx`.
- `app/workspace.css`.
