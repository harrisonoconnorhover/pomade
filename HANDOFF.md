# Morning Handoff

## Finished

- Added authenticated JSON webhook delivery into a durable, table-scoped inbox.
- Added delivery-key deduplication, changed-payload conflict detection and bounded payload validation.
- Added inbox pagination, delivery selection, nested JSON field mapping and import previews.
- Imported rows preserve source provenance and existing edits; repeat imports skip existing event rows and pause active schedules.
- Updated the competitor checklist with automatic ingestion explicitly remaining open. Local build only.

## Try It

Set `POMADE_WEBHOOK_SOURCES` in ignored `.env.local` using `.env.example`, then run `npm run dev`. Open **Webhook inbox** beside Find companies for the table ID and endpoint. POST JSON with a bearer token and stable Idempotency-Key. Refresh the inbox, select deliveries, map fields and import. Run recipes separately. Test server stopped after verification.

## Checks

- Full suite: 127 tests passed before final schedule adjustment; focused webhook suite: 5 passed after it.
- Final typecheck, lint and production build passed.
- Isolated Worker + D1 passed authentication, durable receipts, retries, concurrent deduplication, changed-payload conflicts, invalid/oversized rejection, token-free catalog, table separation and pagination.
- Receiving events left the grid unchanged; home HTTP smoke and final diff whitespace check passed.
- No browser interaction test, real provider calls or public deployment.

## Decisions

- Stage deliveries separately because whole-table editor saves cannot yet safely overlap automatic ingestion.
- Reuse sender delivery keys and stable event row IDs; do not imply business-key deduplication.
- Pause schedules when imports add rows. Keep publication and signup deferred.

## Remaining

- Saved mappings and automatic webhook ingestion with safe overlapping table writes.
- API-as-source, pagination, true provider fallback and richer table transfers.
- More sourcing, signals, reusable multi-step functions and governed CRM writeback.
- Event retention controls and provider-specific signature adapters.
- Later: independent self-host packaging, account isolation, Google sign-in and public release.

## Review First

- `app/api/webhooks/route.ts` for authentication, idempotency and durable receipt behavior.
- `lib/webhook-inbox.ts` and tests for mapping, stable IDs and schedule scope.
- `components/webhook-inbox.tsx` for inbox selection and import preview.
