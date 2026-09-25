# From inconsistent inputs to an inspectable account table

Pomade is a workbook for GTM operators who need to understand where a value came
from before using it. This example demonstrates a small, complete workflow:
normalize supplied data, inspect results, retain missing inputs, and export.
It uses fictional companies and people with reserved `.example` domains.
No research, enrichment, outreach or CRM write occurs.

## Try the existing workflow

1. Follow [Run locally](../README.md#run-locally). A fresh owner installation opens
   **Synthetic cleanup example**. An existing installation keeps its saved sheets:
   create a new empty table and import [these three input rows](examples/synthetic-cleanup-input.csv).
2. The fresh starter already has **Normalized domain**, **First name** and
   **Contact key** columns. For a CSV import, use **Add column** to add the existing
   **Normalized domain**, **First name** and **Dedupe key** formulas. Map website
   input to domain and person to person if prompted.
3. Run the three rows, inspect the run receipt and export the resulting CSV.
   Formula outputs start blank; they are calculated locally when run.

| Supplied company / person | Website input | Normalized domain | First name | Contact key |
| --- | --- | --- | --- | --- |
| Aster Works / Maya Chen | `HTTPS://WWW.ASTER.EXAMPLE/about` | `aster.example` | `Maya` | `person:maya chen\|aster.example` |
| Birch Labs / Rowan Patel | `https://birch.example/team` | `birch.example` | `Rowan` | `person:rowan patel\|birch.example` |
| Cedar Services / Lee Morgan | blank | blank | `Lee` | blank |

The first two rows pass the local run checks. Cedar Services remains **Review**
because its company website is missing. Creating a key does not merge or delete
records. Domain cleanup does not verify that a company exists, and a first-name
split does not verify a person's identity.

## What can be checked

The [starter data](../lib/sample-workspace.ts) declares the input and three
existing formula recipes. The [local runner](../lib/local-recipe-engine.ts)
produces per-action before/after receipts; the [focused test](../lib/sample-workspace.test.ts)
checks the exact outputs, missing-input case, repeated execution and untouched
input snapshot:

```bash
npm test -- lib/sample-workspace.test.ts
```

Expected result: three rows, nine local actions, zero external writes; a repeated
run returns the same values without adding rows. This is deterministic workflow
verification, not an AI-accuracy benchmark. The starter is created only when the
owner has no saved default sheet; no migration rewrites existing sheets.

## Separate historical evidence: connected provider and CRM work

The [September 7, 2026 live benchmark](live-benchmark-2026-09-07.md) documents
15 people checked for work email: Hunter accepted nine, and Prospeo accepted
three of the six remaining. The same recorded exercise updated one contact per
dev CRM, read both records back, and confirmed a second preview was unchanged.
Provider acceptance is not independently proven deliverability; the executive-heavy
sample is not a general coverage estimate. Raw contact data and credentials stay private.

That report also records a failed research attempt and a repaired endpoint.
It does not establish that every provider adapter or unattended hosted schedule
works live. The synthetic walkthrough above can be inspected without those accounts.

## Research status has a narrower meaning than factual approval

The UI's **Checks passed** label (stored as `Ready`) means the relevant runner's
execution/output checks passed. For web research, citations and valid structured
output do not establish that a source supports every claim, that a role is current,
or that the company identity is correct. Review the underlying sources before
using results. A completed workbook run is also separate from human approval.
