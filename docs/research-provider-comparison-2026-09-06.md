# ChatGPT research versus Parallel in Pomade

Measured September 6, 2026 on HealthEdge, Clearwater Security and Solera. **Use Parallel for a cheap first pass and Astra/medium for research where verifying a difficult claim matters.** Luna is a subscription-powered middle option, but it did not outperform Parallel base in this small sample.

Open the saved comparison in [local Pomade](http://localhost:8798/?table=9298258c-01e1-4392-89e7-3548174204f3) or [your private Pomade website](https://pomade.deleteddeleted.chatgpt.site/?table=4ec93d57-9c47-4b1b-bc09-5b88c38de0e9). Each sheet contains all 15 results, timings, source links and review notes. Claims and review assessments reflect the September 6 benchmark; blank fields mean unverified.

| Option tested | Median time per company | Observed result | When to use it |
| --- | ---: | --- | --- |
| Parallel Search, advanced | 2.19 seconds | Returned source excerpts; mixed in unrelated Solera companies | Finding candidate sources for a later reasoning/verification step |
| Parallel research, speed | 2.94 seconds | Three accurate profiles; deeper SOC 2 and hiring fields blank | B2B classification and short company summaries across many rows |
| Parallel research, base | 11.51 seconds | Added SOC 2 evidence; one hiring claim relied on a stale listing | Routine multi-field enrichment, with direct checks for timing signals |
| ChatGPT, Luna/low + browser | 38.92 seconds | Found SOC 2 evidence; no verified hiring leads; one answer had no accepted citations | Focused public-page research using the existing subscription, when latency is secondary |
| ChatGPT, Astra/medium + browser | 67.55 seconds | Found SOC 2 evidence and two independently verified hiring leads | Ambiguous identity, deeper navigation, source validation and high-value accounts |

The time ranges were 2.16–2.40, 2.73–3.63, 9.95–13.28, 31.26–43.10 and 48.10–72.15 seconds respectively. These are three observations per option, not general performance guarantees.

## What changed the recommendation

**HealthEdge:** all four answer-generating options described its B2B software correctly. Parallel speed missed the public [Trust Center](https://trust.healthedge.com/). Parallel base and both ChatGPT models found SOC 2 evidence. The ChatGPT answers explicitly left the audited entity, product coverage and report period unknown; Parallel base added a BPaaS/cloud-platform scope not established by its cited excerpts. Only Astra found and directly verified the live [Commercial Operations Analyst posting, 2026-8232](https://careers-healthedge.icims.com/jobs/8232/commercial-operations-analyst/job). The posting discusses Salesforce administration, sales tools and forecasting, making it a relevant outreach clue without proving purchase intent.

**Clearwater:** all four produced useful profiles and avoided treating its [SOC 2 readiness service](https://clearwatersecurity.com/compliance-services/soc-2/) as evidence of its own attestation. The [early-career page](https://clearwatersecurity.com/about-us/early-careers/) included a talent network; the current readable page did not establish the targeted direct opening. Blank security/hiring fields mean unverified, not that the company has no attestation or vacancies.

**Solera:** raw Search included Solera Health and a Brazilian company alongside the automotive target. Parallel base correctly named the automotive company, but its hiring basis referenced SDR requisition JR-019383 while supplying only the general Workday board URL. Live checks of two direct URL variants showed a missing page with no Apply control. Astra instead found [BDR requisition JR-019664](https://solera.wd5.myworkdayjobs.com/en-US/Global_Career_Site/job/Business-Development-Representative_JR-019664), which independently loaded with an Apply control. That role is in Mexico City (Mitikah) and was posted 30+ days ago: it establishes advertised hiring, not recent expansion. Luna read Solera's pages but returned no citations that survived Pomade's quote checks; its answer requires review despite valid JSON.

## Cost and practical routing

The test made three Parallel Search calls, three speed calls and three base calls: **$0.06 at published list rates**, using the existing account connection. This is a rate-based estimate, not an invoice or verified balance change. At current rates, speed is $5 per 1,000 calls and base is $10 per 1,000 calls. Multiple requested fields fit in the same research call. [Parallel pricing](https://docs.parallel.ai/getting-started/pricing)

The six ChatGPT calls used the signed-in Codex subscription. Pomade's helper does not currently report per-run token or dollar usage, so there is no defensible cents-per-row comparison. Model, reasoning and tool use affect the shared allowance; this competes with other Codex work. [Official OpenAI usage guidance](https://learn.chatgpt.com/docs/pricing)

Suggested routing: use speed for basic qualification; try base for useful missing fields; send qualified accounts with unresolved, consequential claims to Astra/medium. Treat fresh job links, exact company identity and valid source receipts as acceptance criteria. Luna remains useful when avoiding separate API consumption matters, but a faster model can require more human checking. A single combined request may miss details that narrower research columns could retrieve.

Pomade currently chooses the research provider through the installation setting. The model/effort controls added earlier select ChatGPT models; they do not yet provide per-column provider selection or a Parallel-to-Codex research waterfall. Raw Parallel Search was tested directly as a retrieval baseline and is not the existing answer-producing research column. The current Parallel column uses its Chat API. [Parallel Search reference](https://docs.parallel.ai/api-reference/search/search), [Chat API reference](https://docs.parallel.ai/api-reference/chat-api-beta/chat-completions)

## Method and evidence

- Same three companies, prompt and six typed output fields for each research option. Tasks covered product/B2B, the company's own SOC 2 evidence, and a current SDR/BDR/RevOps/SalesOps/Commercial Operations opening with a direct job link. No location restriction was applied.
- Used Pomade's existing research clients and structured-answer parser. ChatGPT used the actual local helper with its six-page browser budget. Parallel used its existing adapter. The comparison did not include separate configured hiring-signal checks, CRM writes or hosted queue latency.
- Twelve research responses returned valid structured data; three Search calls returned retrieval results. Eleven research responses included accepted citation receipts. Valid JSON and a citation count are not accuracy scores.
- Bypassed Pomade's result cache; provider-internal retrieval caching is unknown. Independent source verification and setup time are excluded from measured call durations. One unsuccessful public job-search filter check was replaced by direct posting checks; it did not trigger another research call.
- After user approval, imported the reviewed results into one new comparison sheet in each installation. API readback matched all 15 rows and 13 columns exactly; existing table summaries were unchanged. This reused saved research and made no additional enrichment calls. Provider defaults were unchanged.

Prompts and exact outputs are saved locally in [the comparison folder](../outputs/research-comparison-2026-09-06/): `cases.json`, `results.json`, `base-results.json`, `summary.json`, individual method results, and the Solera live-verification files. Existing clients came from local commit `a8aee2a`. The local runners and importer are under `work/research-comparison/`. `reviewed-results.json` holds the imported presentation; `comparison-tables.json` records both sheet IDs and successful readback checks.
