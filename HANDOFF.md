# Morning Handoff

## Finished

- Numeric AND/OR cost gates, verified-status provider waterfalls, Hunter/Apollo email presets, rich Apollo data and a PDL company adapter.
- Source-linked hiring/leadership presets, technology/title comparisons, normalized intent feed and opt-in signal fields for qualification and CRM.
- Native CRM field discovery, typed custom mappings/imports and qualified scheduled writes.
- Real Apollo revenue/employee data updated three existing companies in each dev CRM; all six records read back and imported, with unchanged repeat previews and no duplicate scheduled batches.
- Reviewed the three companies' leadership rosters against owned pages; retained raw AI misses and excluded unsupported dates/off-focus hiring. All work remains local.

## Try It

Open localhost:8798 and select **DemandDrive — CRM automation**; inspect **Write to CRM** history. The one-time test schedule is complete. **DemandDrive — 3 ICP accounts** contains enrichment/research. **Signals — local acceptance fixture** demonstrates signal tags feeding a formula. Use **Change signals** for research/watches and signal fields, then **Schedule** for recurring CRM mappings. Recurring local runs need `npm run clock -- 8798` alongside the server.

## Checks

- 73 focused tests passed; typecheck, lint and production build passed.
- Live HubSpot/Salesforce scheduled revenue writes, native read-back, imports and repeat/no-duplicate checks passed for all three accounts.
- Fixture webhook deduplication/conflict checks and signal-to-formula persistence passed; no real G2/LinkedIn/visitor feed is connected.
- Live ATS validation rejected an expired Workday listing and verified another posting; manual relevance review excluded the latter. AI leadership coverage/dates still needed correction.

## Decisions

- Keep event dates separate from observed changes; failures do not establish departures/removals.
- Capture bounded CRM mappings per schedule; verified completed batches are reused, uncertain writes stop.
- Prioritize local usefulness; no hosted-account work, public publishing or outreach.

## Remaining

- Salesforce: approval pending for System Administrator read/edit access to three new fields. Automatic approval review rejected this persistent permission change as outside record-write authorization; no custom values have been written.
- HubSpot sign-in/schema permission to create score/tag properties.
- Real Hunter/PDL/phone credentials and multi-provider coverage; Apollo People access remains account-gated.
- Actual visitor/G2/LinkedIn delivery, native workflow/owner/sequence setup and more reliable automated research.
- Follow the active checklist in `docs/requested-workflows.md`.

## Review First

- `docs/requested-workflows.md` and `docs/signals-and-crm.md`.
- `db/scheduled-crm.ts`, `lib/account-signals.ts`, `lib/hiring-evidence.ts`.
- Private `outputs/demanddrive/scheduled-crm-round-trip.json` and `signal-baseline-manual-review.json`.
