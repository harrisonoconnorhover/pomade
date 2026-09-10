# Morning Handoff

## Finished

- Private hosted **version 35** runs source `24c5fc250829611cd13308d06a2b255590a05433`: researched Personal opener and the stale-selection row-deletion correction. This GitHub catch-up does not redeploy it.
- **Personal opener** provides an editable research prompt, provider choice and input mapping, with four outputs: draft, evidence, source URL and assessment. The default prompt requests a blank opener when evidence is insufficient.
- Adding the recipe does not run research. Existing legacy opener values and generic local behavior remain unchanged, with deliberate adoption available in column settings.
- This is the approved **private GitHub catch-up snapshot**: 123 accumulated development commits plus this handoff update, preserving the existing history. No public release, tags, visibility change, other-project push or hosted-setting change is included.

## Try It

1. Open [private hosted Pomade](https://pomade.deleteddeleted.chatgpt.site), refresh an old tab, then choose **Add column → Personal opener**. [Local Pomade](http://localhost:8798) uses separate saved data.
2. Map the company website, choose a provider and customize the prompt/focus. **Add function** creates blank columns; review row scope and provider access before running. Review evidence before using the draft.
3. Source and self-hosting instructions are in the [private GitHub repository](https://github.com/harrisonoconnorhover/pomade) and `README.md`.

## Checks

- September 10 source review: all 123 outgoing commits and 328 historical paths inspected for sensitive data/artifacts. Gitleaks 8.30.1 scanned the outgoing history with zero findings. Local credentials, saved state, raw results and build output remain ignored.
- GitHub main was `2693b9ee2e98936abb932a0ff132684d4da7ab27`, an ancestor with no divergent commits. Repository private; no Actions workflows, Pages site or active local pre-push hook. No CI pass is claimed.
- Reused September 9 exact-runtime evidence: 39 focused tests, typecheck, lint, local/hosted builds and seven disposable browser checks passed. No runtime changes or broad reruns for this source sync.
- Version 35/source and its one-owner audience were rechecked through Sites. Earlier deployment checks preserved 16 hosted and 28 local sheets and connection status; live opener/cancel passed with no application writes, hosted/local roots returned 200 and anonymous hosted access returned 401.
- Current handoff syntax, word limit and Git diff checks passed. The final GitHub SHA and any triggered checks are verified after the push and reported with the release result.

## Decisions

- One deliberate GitHub catch-up is approved; routine development iterations remain local unless authorized.
- Preserve existing history, data, connections and private access. Synthetic research tests prove wiring, not live factual accuracy.

## Remaining

- Live provider quality and plan entitlement were not exercised.
- ChatGPT research needs the Mac; unattended hosted timers remain unverified.
- Company summary, demo ICP replacement and CRM deal notes are separate work.

## Review First

- `lib/research-recipes.ts`, opener setup and legacy adoption.
- `lib/row-management.ts` and regression tests.
- `README.md` and `docs/workbook-quick-start.md`.
