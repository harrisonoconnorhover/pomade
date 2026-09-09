# Morning Handoff

## Finished

- Published private hosted **version 35**, source `24c5fc250829611cd13308d06a2b255590a05433`. It includes the researched Personal opener and the fix preventing stale row selections from deleting unrelated generated rows.
- **Personal opener** offers an editable research prompt, provider choice and input mapping. Four outputs hold the draft, evidence, source URL and assessment; the prompt requests a blank opener when evidence is insufficient.
- Adding the recipe does not execute it. Legacy `write-opener` columns retain their generic local behavior and existing values, with a deliberate **Add researched opener** action in settings.
- Hosted access remains owner-only. The stopped local server was restored using its unchanged build. No GitHub push, paid provider call, CRM write, runtime-setting change or callback change occurred.

## Try It

1. Open [private hosted Pomade](https://pomade.deleteddeleted.chatgpt.site), refresh an already-open tab, and choose **Add column → Personal opener**. [Local Pomade](http://localhost:8798) also has this recipe, with separate saved data.
2. Map the company website, choose a provider, and optionally edit the prompt/focus. **Add function** creates four blank columns without running research.
3. Check provider access and row scope before running. Review the source and run receipt before using the draft; save the column as a template to reuse it.

## Checks

- 39 focused tests passed: 21 opener/template tests and 18 row-deletion/schedule tests. Typecheck, lint, and release diff checks passed.
- Reused successful local and hosted builds from unchanged runtime source. The prescribed Sites helper archive passed entrypoint, asset, manifest, hosted-mode and all 12 unchanged migration checks.
- Seven disposable local browser checks passed, including cancel, mapping, provider/prompt persistence, legacy adoption and 390px layout; screenshots reviewed. All 28 local sheet hashes matched again after restoring the local server.
- Sites confirmed deployment succeeded, version 35/source above, unchanged environment revision 9 and access revision 1: one account, no external visitors or groups.
- Authenticated live checks opened the new recipe and cancelled without workbook writes. All 16 hosted sheet hashes, connection-status responses and disabled schedules matched their pre-deployment state; no active jobs. Local build hashes also matched. Hosted/local roots returned 200; anonymous hosted access returned 401. Live browser checks reported zero application mutations and page errors; one automatic Cloudflare background check was blocked.

## Decisions

- Keep existing data, credentials, access and schema; deploy only the two approved changes.
- Preserve legacy execution. Synthetic provider responses prove wiring, not live research accuracy; source review remains necessary.

## Remaining

- Live provider quality and plan entitlement were not exercised.
- ChatGPT research still needs the connected Mac; unattended hosted timers remain unverified.
- Company summary, demo ICP replacement and CRM deal notes are separate work.

## Review First

- `lib/research-recipes.ts` and `lib/personal-opener.test.ts`.
- `lib/row-management.ts` and its regression tests.
- Personal opener setup and legacy adoption in `components/pomade-workspace.tsx`.
