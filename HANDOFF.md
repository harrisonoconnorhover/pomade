# Morning Handoff

## Finished

- Added persistent named CRM mappings with save, update, reuse and removal.
- Added copying of verified native CRM IDs from batch receipts into table columns; matching saved mappings reuse those IDs.
- Protected saved mapping columns from accidental deletion and left changed/conflicting rows for review during ID copying.
- Saved four working mappings in the DemandDrive tables and a three-person **Named CRM contacts** view.

## Try It

Open http://localhost:8798/ → **Tables** → **DemandDrive — 3 ICP accounts** → **Write to CRM** → choose **HubSpot — account research** or **Salesforce — account research**. Preview the selected/visible rows, then confirm.

For the buyer committee, choose **Named CRM contacts**, then a saved buyer-contact mapping. After a verified batch, use **Copy verified IDs to table**. New mappings can be named and saved in the same dialog.

## Checks

- 31 focused tests passed: CRM mappings, writes, imports, column dependencies and table duplication.
- Typecheck, lint and production build passed.
- Four mappings persisted/reloaded and verified all 12 existing dev CRM records with unchanged-only actions. ID copying persisted/reloaded successfully.
- Named-contact view returned exactly three rows. Local home HTTP 200.
- No browser interaction test, Parallel/Apollo requests, new CRM records or deployment.

## Decisions

- Reuse workspace persistence and version history; mappings store no credentials or row selection.
- Copy IDs only from verified receipts whose mapped row values still match; preserve conflicting existing IDs.
- Keep this a manual CRM workflow; saved mappings do not enable continuous sync.

## Remaining

- Reusable scoring and research review.
- Native HubSpot contact/company associations and continuous CRM sync.
- Durable Salesforce OAuth and interrupted-write reconciliation UI.
- Portable mapping templates, custom fields/objects and broader providers. Apollo Free still blocks People Enrichment.
- Self-host packaging, hosted accounts and public release later.

## Review First

- `lib/crm-mappings.ts` for mapping persistence and verified-ID copying.
- `components/crm-sync-builder.tsx` for saved mapping and receipt actions.
- `outputs/demanddrive/crm-mappings-check.json` for the live reuse receipts.
