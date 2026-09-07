# DemandDrive live benchmark — September 7, 2026

The benchmark reused HealthEdge, Clearwater Security and Solera. The old buyer-committee sheet had 15 rows but only three named people; its other rows were role hypotheses. New research identified 15 real current executives or senior leaders, five per company. Names and titles were checked against the [HealthEdge](https://healthedge.com/about-us/leadership/), [Clearwater](https://clearwatersecurity.com/about-us/leadership/) and [Solera](https://www.solera.com/company/leadership/) company pages. This establishes professional identity and role, not purchasing authority or a complete five-person technical buying committee.

## Email and mobile coverage

| Measurement | Observed result |
|---|---:|
| People tested for work email | 15 |
| Accepted by Hunter as valid | 9 / 15 |
| Hunter misses sent to Prospeo | 6 |
| Additional Prospeo VERIFIED emails | 3 |
| Combined accepted work emails | **12 / 15 (80%)** |
| Additional coverage from fallback | **20 percentage points** |
| Email requests | 21 |
| Original contacts tested for mobile | 3 |
| Prospeo verified/revealed mobile results | **1 / 3** |
| Mobile requests | 3 |
| Provider execution errors | 0 |

Emails required Hunter `data.verification.status=valid` or Prospeo `person.email.status=VERIFIED`; mobile required both VERIFIED and revealed status for that number. No email was guessed, no message was sent, and no independent delivery or phone-ownership test was performed. The waterfall stopped immediately after an accepted result. It did not call every vendor for every row, so this is an ordered waterfall benchmark, not a balanced head-to-head comparison of provider databases.

The three five-person email batches took 21.9, 6.4 and 19.4 seconds. Provider reporting showed mean result times of 1.88 seconds for Hunter and 3.23 seconds for Prospeo (including local pacing). The sample is small and executive-heavy; these match rates are not a market-wide estimate.

Both accounts reported Free plans. During the benchmark, Hunter's reported credit balance changed from 48 to 35 and Prospeo's from 90 to 87. Hunter separately exposed verification counters; those are not added to the unified credit delta. These are observed account-balance changes, not a per-operation bill. The request receipts correctly retain unknown per-request costs. No plan, top-up or new paid service was purchased.

## Research comparison and repair

The first Parallel attempt exposed an obsolete client endpoint/authentication header. The client now uses the [documented Chat API](https://docs.parallel.ai/api-reference/chat-api-beta/chat-completions), `/v1beta/chat/completions` with `x-api-key`. Failed receipts were retained.

After that repair, three Parallel `speed` requests completed in 7.4 seconds total and returned two candidates at one company. Neither met this benchmark's requested company-source evidence requirement: one supplied company article did not substantiate the person/role, and the other supplied only a LinkedIn URL. Both remain visibly marked Review and were excluded from enrichment.

The existing local ChatGPT/Codex browser engine returned 15 source-linked names in 105 seconds total (31.2, 41.9 and 31.9 seconds), all corroborated against company leadership pages. It received the same companies and source pages plus an instruction to prioritize the three original named contacts. This was a practical workflow comparison, not a controlled model evaluation. Source URLs were populated in table fields; the Codex receipts' separate references arrays were empty. Use the source columns when reviewing this run.

For this task, the local browser engine was more useful for leadership extraction. Parallel was much faster but needed evidence review. The result does not establish that one engine is universally better; higher Parallel research tiers were not tested in this run.

## Live CRM round trip

The existing HubSpot segment **Pomade test — DemandDrive contacts** imported three contacts into a separate sheet. A Pomade table lookup joined those records to the reviewed enrichment results using person plus company domain. Existing native IDs were retained for both dev CRMs.

Preview showed one contact needed an email/mobile update and the other two were already unchanged. Pomade executed that update in HubSpot and Salesforce and verified each by reading the native record. Fresh second previews showed all three unchanged in both CRMs. Replaying the completed plan returned the completed result without another mutation.

HubSpot segment refresh pulled the new values into the sheet while preserving lookup outputs and Salesforce IDs. Salesforce native readback was imported into another sheet; repeating that import kept exactly three distinct native IDs. This run created **zero CRM contacts** and updated **one contact per CRM**. Automatic refresh schedules remain paused; these were manual live tests.

## Remaining access boundaries

Apollo People Enrichment was rechecked with one work-profile request and no phone or personal-email reveal. It returned HTTP 403, explicitly saying the Free plan excludes that endpoint even with a master key. The new Apollo mobile adapter therefore has synthetic and compiled-Worker validation, but no live phone call. It also requires a public HTTPS callback receiver controlled by the account owner. The private Sites address is not such a receiver.

Dropcontact has a complete single-person named-work-email submit/poll adapter with tests, but no connected key and no live match-rate claim. The core provider backlog is now 14 implemented vendors and 14 remaining, with 31 contact presets.

## Private evidence

Raw responses, contact values, before/after balances and CRM plans are in ignored `outputs/demanddrive/2026-09-07-workflow-benchmark/`. `manifest.json` lists the private workbook IDs; `summary.json` and `crm-check-summary.json` contain machine-readable results. Provider reporting on the local enrichment table holds the four enrichment-run receipts. Private hosted copies contain the resulting tables; local run history remains the evidence source.
