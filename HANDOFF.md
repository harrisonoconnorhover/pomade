# Morning Handoff

## Finished

- Completed the three-company DemandDrive/HeroDevs exercise: cited signals, reviewed scores, 15 buyer roles and three verified public candidates.
- Added direct mapped CRM create/update previews, native receipts and read-back checks.
- Created three companies and three contacts in each dev CRM; imported all 12 records into four Pomade tables.
- Fixed research list parsing with appended citations and HubSpot URL normalization.
- Moved local start persistence outside build output so rebuilds retain tables/receipts.

## Try It

Open http://localhost:8798/ → **Tables** → **DemandDrive — 3 ICP accounts** or **DemandDrive — Buyer committee**. Select rows → **Write to CRM**, choose object/mappings/native ID column, preview and confirm. **Load data** previews companies/contacts from either CRM. Full assignment and private receipts: `outputs/demanddrive/REPORT.md`.

## Checks

- 34 focused CRM import/write and research tests passed.
- Typecheck, lint and production build passed.
- Live company/contact creates, native read-back and all four imports passed.
- Both CRMs passed a mapped description update and unchanged repeat; replaying a completed batch returned its saved receipt.
- Contact re-matching and duplicate-free import refresh passed in both CRMs. New migration passed repeat application while preserving a receipt.
- Local home HTTP 200. No browser interaction test or deployment.

## Decisions

- Use existing dev credentials and bounded direct writes; retain Control Tower preview export.
- Prefer native IDs, then domain/email or full name plus company context. Keep blank emails when enrichment is unavailable.
- Preserve raw AI outputs separately from reviewed scores and keep private assignment/CRM data out of Git.

## Remaining

- Apollo Free plan blocks People Enrichment (HTTP 403); company enrichment passed live.
- Reusable scoring/research review and saved CRM mappings.
- Native HubSpot associations, continuous sync and custom fields/objects.
- Durable Salesforce OAuth and interrupted-write reconciliation UI; a running batch requires native inspection before recovery.
- Self-host packaging, hosted accounts and public release later.

## Review First

- `outputs/demanddrive/REPORT.md` for assignment and native CRM IDs.
- `lib/crm-sync.ts` and `app/api/crm-sync/route.ts` for matching, writes and receipts.
- `components/crm-sync-builder.tsx` for the mapped preview/write flow.
