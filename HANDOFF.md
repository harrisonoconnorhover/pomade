# Morning Handoff

## Finished

- Waterfall enrichment, qualification rules, rich company data, source-linked research and normalized signal fields remain available locally.
- Salesforce access is enabled for exactly the three approved Pomade Account fields. Matching HubSpot company properties are created; no API token scope expansion was needed.
- Wrote and read back ICP scores, priority tiers and reviewed research tags for HealthEdge, Clearwater Security and Solera in both dev CRMs. Imported the exact values into the existing Pomade tables.
- Research and automation mappings now include all three custom fields. The automation also retains revenue/employee mappings and its qualification rules.
- The one-time custom-field schedule passed and is disabled. All code and documentation remain local.

## Try It

Open localhost:8798 and select **DemandDrive — 3 ICP accounts**. In **Write to CRM**, load either saved account mapping to inspect score/tier/tag bindings and write history. Open the HubSpot company or Salesforce account import table for returned custom values. **DemandDrive — CRM automation** contains the qualified scheduled example; resave its schedule to enable future runs. Local recurring runs need the server plus `npm run clock -- 8798`.

## Checks

- Both live custom-field round trips passed: three existing companies per CRM, exact native values, persisted imports and six unchanged repeat actions.
- Updated scheduled mappings passed with six verified unchanged actions, three retained rows and a complete/disabled schedule. No enrichment calls were made.
- Earlier implementation checks: 73 focused tests, typecheck, lint and production build passed. This follow-up changes account configuration, saved tables and documentation; runtime code is unchanged.
- Documentation diff and handoff format/length checks passed.

## Decisions

- Scope Salesforce permission changes to the approved fields and reuse HubSpot's existing token scopes.
- Preserve reviewed ICP tags separately from real visitor/G2/LinkedIn events.
- Keep the finished automation example stopped and retain prior write receipts.

## Remaining

- Real Hunter/PDL/phone credentials and live multi-provider coverage; Apollo People access remains account-gated.
- Actual visitor/G2/LinkedIn delivery and native CRM workflow/owner/sequence setup.
- More reliable automated research and broader hiring-source validation.
- Continue the active checklist in `docs/requested-workflows.md`; hosted accounts and independent self-host packaging remain later milestones.

## Review First

- `docs/requested-workflows.md` and `docs/signals-and-crm.md`.
- Private `outputs/demanddrive/hubspot-custom-fields-round-trip.json` and `salesforce-custom-fields-round-trip.json`.
- Private `outputs/demanddrive/scheduled-custom-fields-round-trip.json`.
