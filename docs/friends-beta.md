# Pomade friends beta

Open **Account** on the hosted website to manage your connections and allowed
friends. Each person has private sheets, workbook templates, run history,
research, provider caches, jobs, and CRM refreshes. The local installation keeps
its existing single-user setup.

The site can remain owner-only indefinitely. No friend addresses or invitations
are needed until someone actually wants to try Pomade.

## Invite someone

1. In **Account → Friends beta**, allow their sign-in email (up to three friends).
2. Add the same email as a visitor in the private Sites sharing settings. Pomade
   does not send invitations or change the host's access policy itself.
3. They open the existing Pomade URL, sign in with ChatGPT, and start with an
   empty table. **Account** lets them add their own provider and CRM tokens.

Use **Revoke access** to block their next request and future background runs.
Their data is retained, so allowing the same email again restores their account.
A request already in progress may finish. Keep the site private; direct Google
sign-in has not been implemented on this host.

## Personal connections

Apollo, Hunter, Prospeo, People Data Labs, Parallel, and Gemini accept API keys.
Keys are encrypted on the server and never returned by the settings endpoint.
Save a replacement key by entering it again; disconnect removes it. The site
owner operates the server and encryption key; this is not end-to-end encryption.

For **HubSpot**, use a private app access token with CRM object read/write scopes
for the objects you use and list-read scope for segment imports. For
**Salesforce**, enter the instance URL and an access token; an app client ID and
refresh token enable the existing session renewal. These are token connections,
not a one-click CRM OAuth consent flow. Use **Test read access** to check a single
company/account record without writing. Then use the table's existing CRM import,
segment chooser, refresh, preview, and sync controls.

Changing a CRM connection clears pending previews and stops queued work/refreshes.
Preview the new source again before restarting. Completed records remain in your
sheets. Existing owner ChatGPT companion research continues; new members can use
their Parallel/Gemini keys. Personal Mac companion onboarding is still separate.

## Operate and verify

Hosted settings: `POMADE_ACCOUNTS_ENABLED=true`, existing owner/public-origin
settings, and a secret `POMADE_VAULT_KEY` containing 32 random bytes encoded as
base64. Deploy the additive Drizzle migration before enabling accounts. Owner
credentials migrate into the vault on first request; owner table IDs stay intact.
Back up the vault key alongside encrypted database backups, in separate storage.

Run `npm test -- lib/accounts.test.ts`, `npm run typecheck`, and `npm run lint`.
After `npm run build:hosted`, run `node scripts/test-accounts-worker.mjs` for a
real Worker exercise with an owner and three synthetic friends in disposable D1.
The script makes no provider calls and does not touch live accounts.

Hosted automatic work advances while that person's website is open. The owner's
existing companion wakes the owner's jobs only. Native scheduled execution is
also scoped per active account where the host delivers timers.
