# Pomade Apollo callback receiver

A small, independent public HTTPS service for Apollo phone enrichment. It acknowledges JSON delivery and discards the body. It has no database, no provider/CRM/Pomade credentials, no outbound network calls, and no application payload logging. Hosting infrastructure may retain request metadata; this is not a claim that the hosting provider sees no traffic.

Pomade reads the result from Apollo's authenticated `GET /api/v1/webhook_result/{request_id}` endpoint. The callback body never enters a workbook and is not treated as authenticated provider evidence. This lets the main app remain owner-private and lets local Pomade resume after the Mac sleeps. Polling permission is required even when delivery succeeds.

## Run and deploy

From the Pomade repository:

- `npm --prefix services/apollo-callback test`
- `npm --prefix services/apollo-callback run build`
- Deploy the resulting Worker to a public HTTPS host. This folder is a complete dependency-free service; it uses the same Worker runtime as Pomade. For Sites, preserve the separate project ID in `.openai/hosting.json`, package this folder with the Sites helper, and publish only this service as public. The root Pomade project keeps its own owner-only policy.
- For Sites source publishing, commit the service in Pomade, use `git subtree split --prefix=services/apollo-callback` to export only this folder, and check out that returned commit in a disposable worktree. Push that worktree to the callback project's private Sites source repository, build/package there, and save its exact full HEAD. No GitHub publication is required.

Generate a fresh 32-byte random token encoded as base64url. Set **only its lowercase SHA-256 hex digest** as the receiver's `POMADE_CALLBACK_TOKEN_SHA256` secret. The full callback URL is `https://YOUR-PUBLIC-HOST/apollo/TOKEN`. Never use a provider key, Sites sign-in credential, or Pomade owner token as the receipt token.

Set `POMADE_APOLLO_CALLBACK_URL` to that full URL in Pomade's ignored `.env.local` and/or hosted server secrets. Rebuild/restart local Pomade or redeploy the hosted app after changing runtime settings. A personal `APOLLO_WEBHOOK_URL` overrides the default; an invalid explicit override does not silently fall back. Each user still supplies their own `APOLLO_API_KEY`.

## Verify

`GET /health` returns the service name. `GET` to the token URL confirms that the receipt token is configured. `POST` to the token URL with `Content-Type: application/json` and `{"status":"success","people":[],"total_requested_enrichments":0}` returns `received: true`. No sign-in or extra authentication headers should be needed. Account → Connections → Apollo → **Test Pomade callback** performs both token checks without submitting an Apollo lookup. It checks the installation default, not a custom override.

Other routes return 404, unsupported methods 405, malformed JSON 400, wrong content types 415, and bodies over 1 MiB 413, including chunked requests. Duplicate deliveries have no side effects. There is no public result retrieval endpoint. Rotate a leaked receipt token by updating its digest and both installation URLs; existing result polling remains independent of the receipt token.

## Provider contract

- [Apollo mobile retrieval](https://docs.apollo.io/docs/retrieve-mobile-phone-numbers-for-contacts): public HTTPS callback and asynchronous POST delivery.
- [Apollo result polling](https://docs.apollo.io/reference/poll-webhook-result): saved signed 64-bit request ID, required permission, results available for up to 30 days.

Synthetic callback delivery proves reachability and the receiver contract. It does not prove Apollo plan eligibility, real phone coverage, or billing. Live phone validation still needs an eligible Apollo key.
