# Morning Handoff

## Finished

- Added an invite-only hosted beta for the owner and three friends. Each account has private tables, templates, history, caches, research, jobs, and CRM refreshes.
- Added **Account** with encrypted personal API keys, HubSpot/Salesforce token connections, read-access checks, replacement/disconnect controls, and owner-only allow/revoke controls.
- Preserved owner table IDs and imported existing hosted credentials into the encrypted vault once. Missing member keys never fall back to owner credentials.
- Scoped background work and the existing owner research companion to the correct account. CRM replacement clears pending previews and stops queued work/refreshes.

## Try It

- Open [Pomade](https://pomade.deleteddeleted.chatgpt.site) → **Account**. Add personal connections or allow a friend’s sign-in email.
- Add that same email to the private Sites visitor list before they open the website. No friends have been invited yet; their addresses are still needed.
- The local version remains at http://localhost:8798. Detailed setup is in `docs/friends-beta.md`.

## Checks

- 27 focused tests passed: accounts, deployment authorization, background wakeups, workbook execution, and Salesforce renewal.
- Built Worker passed a disposable four-account HTTP test: concurrent identity/credential isolation, empty onboarding, other-user table rejection, private job lists, member admin denial, disconnect, and revoke.
- Typecheck, lint, local and hosted builds, script syntax, and diff whitespace checks passed. No browser visual QA performed.
- Before release: 11 hosted tables and 19 local tables. Post-deployment preservation and live CRM checks will be recorded after publication.

## Decisions

- Reuse private Sites ChatGPT sign-in; direct Google sign-in is not implemented. Pomade membership and the host’s visitor list are separate gates.
- Use isolated namespaces for the 17 existing data tables; preserve the owner’s names. AES-GCM protects stored keys; keep the vault key backup private and do not rotate it without re-encryption.
- No purchases, outreach, public publishing, or GitHub pushes.

## Remaining

- Obtain friends’ email addresses, allow them in Pomade, and add them as private-site visitors.
- One-click CRM OAuth consent and personal Mac companion onboarding are separate work. Friends currently connect CRM tokens and use their own Parallel/Gemini keys.
- Hosted background work needs that person’s website open; the existing owner companion wakes owner work. Native unattended Sites timers remain unverified.

## Review First

- `db/accounts.ts`, `lib/account-database.ts`, and `worker.ts`.
- `db/account-handler.ts`, `lib/credential-vault.ts`, and `components/account-settings.tsx`.
- `lib/accounts.test.ts`, `scripts/test-accounts-worker.mjs`, and `docs/friends-beta.md`.
