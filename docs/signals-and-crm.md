# Account signals and scheduled CRM

## Use the local workflow

1. Open **Change signals**. Add hiring or leadership research and choose the target
   roles. Run the new column to establish a baseline; use recipe settings to edit
   questions, input bindings and numeric/AND/OR qualification.
2. Watch technology lists as **technology / set**. Comparisons ignore ordering
   and case. A changed title for the same named leader includes both titles.
   First-observed additions are not asserted hire dates; missing research is not
   evidence of departures. The research presets suppress removals.
3. Enable **Make latest signal and tags available to recipes and CRM mappings**.
   Five fields refresh from the newest 100 feed batches before recipe execution;
   newly detected changes also reach those fields before scheduled CRM writes.
   Tags accumulate, and older event deliveries cannot overwrite a newer event.
   Use `signal_feed_tags` or `signal_latest_kind` in conditions and map
   `signal_latest_summary`, `signal_latest_at` and `signal_latest_url` into CRM.
4. Save a mapping in **Write to CRM**, using the native field picker for custom
   fields. In **Schedule**, select up to two distinct CRM/object destinations,
   add qualification and allow their recurring writes. Each destination supports
   at most 25 qualifying rows. Recipes finish first, CRM writes follow, then table
   transfers. A failure stops later work; already verified CRM writes remain.
5. Start the built local server on port 8798 and `npm run clock -- 8798` for local
   recurring runs. `npm run clock -- 8798 --once` delivers one tick. Keep both
   processes running for local schedules; this is not a hosted always-on service.

Schedules capture mappings and conditions. Later mapping edits take effect after
resaving the schedule. Each execution has stable batch IDs; a completed batch is
not written twice after a retry. An interrupted or uncertain CRM batch requires
inspection in **Write to CRM** history. Native property changes can trigger CRM
workflows already configured in the account. Pomade does not claim to have set up
HubSpot workflow enrollment, Salesforce Flow, owner routing or sequences here.

## Ingest intent from an existing source

Configure a server-side `POMADE_WEBHOOK_SOURCES` entry with a target table ID,
a private token of at least 32 characters and `"mode":"signals"`. Keep the token
in ignored environment configuration. Deliver an object or array (1–100 objects)
to `POST /api/webhooks?source=<configured-source-id>` with the Bearer token and a
stable `Idempotency-Key` for retries:

```json
{
  "domain": "example.com",
  "kind": "g2",
  "summary": "TEST FIXTURE: compared products",
  "url": "https://example.com/evidence",
  "occurredAt": "2026-09-01T12:00:00Z"
}
```

Supported kinds: hiring, leadership, technology, website, g2 and linkedin. The
normalized domain must identify exactly one existing account. The source URL and
event time are required. Ingestion time is recorded separately. Duplicate delivery
is accepted without a second event; reusing a key for changed data returns 409.
This endpoint normalizes already available data. It does not identify anonymous
visitors or confer G2/LinkedIn API access. Those source integrations remain open.

## Evidence and limits

The three real assignment companies received Apollo revenue and employee counts
in both dev CRMs through the scheduler. All six native records were read back,
imported and persisted; repeat previews were unchanged and a second clock tick
created no extra write batches. See private `outputs/demanddrive/` receipts:
`scheduled-crm-round-trip.json` and `signal-fields-pipeline.json`.

Parallel now uses documented JSON-schema output for structured requests and keeps
raw answers/citations. Invalid JSON or types do not spill into qualification
fields. Hiring checks verify Workday availability or JobPosting metadata on
supported ATS domains; unknown/expired/unreachable pages stay in review. A live
Workday HTTP 200 page reported `postingAvailable: false`, demonstrating why HTTP
success alone is insufficient.

Research is not yet reliably autonomous: it missed one owned leadership page,
supplied unsupported dates and an off-focus job. Final company rosters were
manually checked, dates without page evidence were cleared, and the unrelated job
was excluded. That run's two off-focus experimental feed entries were preserved
in `rejected-hiring-test-batch.json` and removed from the live assignment feed.
Raw AI outputs are preserved in `current-leadership-baseline.json`,
`current-hiring-check.json` and `signal-baseline-manual-review.json`. Source date
and observation date remain distinct. Provider technology lists are observations,
not proof that tools were installed or removed on that date.

Reference: [Parallel structured output](https://docs.parallel.ai/chat-api/chat-quickstart),
[HubSpot properties](https://developers.hubspot.com/docs/api-reference/legacy/crm/properties/guide),
[G2 intent reference](https://documentation.g2.com/docs/buyer-intent-data-reference).
