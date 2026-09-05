# Morning Handoff

## Finished

- Added native CRM field discovery and selection for custom scores, tags, owners and other writable fields.
- Added typed validation and Salesforce numeric/boolean payloads, preserving native read-back and unchanged-record detection.
- Added requested custom-property reads and imports with dedicated columns that refresh without losing local notes.
- Saved/reused the HubSpot mapping with employees and location; wrote and reimported the three existing dev companies.
- Created the three named Pomade score/tier/tag field definitions in Salesforce; access is pending.

## Try It

Open http://localhost:8798/ → **Write to CRM** → **Add a CRM property or custom field**. Choose a property and its source column, save the mapping, then preview. In **Load data**, supply comma-separated internal property names to import extra CRM values. The DemandDrive HubSpot company import contains the verified employees and location fields.

## Checks

- 30 tests passed across native metadata, typed writes, CRM reads/imports and saved mappings.
- Typecheck, lint and production build passed.
- Live HubSpot: three dev companies updated, read back, imported and persisted; repeated preview returned three unchanged actions.
- Live metadata: HubSpot returned 68 writable company fields and Salesforce 56 writable account fields before field setup.
- Salesforce created three field definitions; native describe excludes them until access is granted. No custom score/tag writes have occurred.

## Decisions

- Native CRM metadata is authoritative; client metadata cannot grant access or override field types.
- Skip blank writes; require an exact verified record read-back.
- Keep schemas and private native receipts separate from credentials and public publishing.

## Remaining

- Salesforce: pending approval to grant the dev System Administrator profile read/edit access only to the three Pomade fields; automatic approval review rejected the permission change as beyond prior record-write authorization.
- HubSpot: pending sign-in to enable company-schema permission; current token cannot create score/tag definitions.
- Scheduled CRM orchestration and dedicated buying-signal sources/feed.
- Real Hunter/PDL/phone-provider connections and account-gated intent sources.
- Hosted accounts and public release later.

## Review First

- `lib/crm-fields.ts`, `lib/crm-sync.ts`, and `lib/crm-fields.test.ts`.
- `components/crm-sync-builder.tsx` and the CRM importer.
- `outputs/demanddrive/hubspot-custom-crm-round-trip.json` and `salesforce-custom-fields.json`.
