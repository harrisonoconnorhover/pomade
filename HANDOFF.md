# Morning Handoff

## Finished

- Added an Apollo company enrichment preset and existing-key server connection.
- Mapped company, domain, industry and numeric employee estimate outputs.
- Normalized inputs and withheld mismatched response identities.
- Retained run/queue/schedule confirmation, templates and unknown actual-credit reporting.

## Try It

With `APOLLO_API_KEY` configured locally, open **Provider presets**, choose a domain column and add. Review the new columns, then run or queue selected rows through ordinary confirmation. API access depends on account/key scope. Test Worker and local fixture stopped after checks.

## Checks

- 19 focused preset, HTTP and template tests passed.
- Typecheck, lint and production build passed.
- Apollo official endpoint/auth docs and embedded response field names verified.
- Isolated Worker + D1 passed safe catalog output, saved preset, confirmation gate, normalized manual/queued fixture calls, typed results and mismatch withholding.
- Home HTTP 200 and diff review/whitespace passed. No browser interaction test, real Apollo call or deployment.

## Decisions

- Built-in connection origin/header stay server-side; custom HTTP recipes remain available.
- Documented price is separate from actual consumed credits.
- Local tests do not establish live provider qualification.

## Remaining

- Broader native provider presets and scoped live qualification.
- Dedicated external-event monitors and numeric/grouped aggregations.
- Structural function migration and bulk rollout.
- Governed CRM writeback and portable workbook export.
- Self-host packaging, hosted accounts and public release later.

## Review First

- `lib/provider-presets.ts` and `lib/provider-connections.ts` for preset/key configuration.
- `lib/http-enrichment.ts` for normalization and response identity checks.
- `docs/capability-gap.md` for contract sources and remaining gaps.
