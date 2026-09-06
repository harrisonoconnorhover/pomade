# Research using a ChatGPT subscription

Pomade can now use a locally signed-in Codex session for live web research.
This is an optional local/self-hosted provider, alongside Parallel and Gemini.
It consumes the signed-in user's Codex subscription allowance. It is not an
OpenAI API key, unlimited research, or access to Apollo/Hunter/Prospeo data.

Job Ops uses the official Codex app-server and its managed ChatGPT login for its
LLM provider. Its job-board extractors remain separate. Pomade's first slice
uses the official `codex exec` command through a small loopback Node helper;
there is no copied Job Ops source or extraction of OAuth tokens. The existing
Cloudflare Worker calls that helper because it cannot start a native CLI.

## Local setup

1. Install a current Codex CLI and run `codex login`, selecting ChatGPT. On this
   Mac, the installed CLI is bundled with the desktop app. Version 0.153.3 was
   tested; `codex login status` reports ChatGPT authentication.
2. Put these settings in ignored `.env.local`:

   ```dotenv
   POMADE_RESEARCH_PROVIDER=codex
   POMADE_CODEX_URL=http://127.0.0.1:9876
   POMADE_CODEX_TOKEN=your_random_32_or_more_character_local_connection_secret
   # Only if codex is not in PATH:
   # POMADE_CODEX_BIN=/absolute/path/to/codex
   # Optional model accepted by your Codex account:
   # POMADE_CODEX_MODEL=your_model
   ```

   Generate the local connection secret with
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   This secret authenticates Pomade to its local helper; it is not a ChatGPT
   credential. Keep its value out of the browser and Git.
3. Keep `npm run research:codex` running. Rebuild with `npm run build`, then run
   `npm run start -- --port 8798`. Vite captures the local Worker variables at
   build time, so changing provider settings requires rebuilding and restarting.
4. Open Pomade's research recipe and check **Codex · ChatGPT subscription** is
   connected. Run selected rows as usual; inspect their source links and receipts.

The helper only listens on 127.0.0.1, accepts authenticated server calls, and
runs one research request at a time. Each request has a three-minute limit.
Codex uses managed ChatGPT authentication, live web search, an empty temporary
working directory, read-only sandboxing, and disabled shell, apps, plugins and
subagents. Provider/CRM keys are not passed to the Codex process. Temporary
research files are removed after the request; Pomade retains results in its
normal local table/cache history.

Explicit `POMADE_RESEARCH_PROVIDER=codex` never falls back to an API provider
when the helper is stopped, login expires or subscription usage is exhausted.
Choose `parallel` or `gemini` explicitly to switch back. Removing the selection
restores the earlier automatic preference for Parallel, then Gemini.

## Choose a model and reasoning effort

In **Add AI web research**, use **Research settings**. Existing columns have the
same controls in **Column settings** and **Recipe engine → Recipe run settings**.
Keep **Use app defaults** checked, or uncheck it to choose a model and one of its
supported effort levels for that column.

Expand **ChatGPT research defaults** to save shared defaults for this installation.
The same editor is available in **Load data**. Changes apply without rebuilding.
The local and hosted installations retain their own defaults, just like their data.
A column override wins over saved app defaults. Without saved defaults, optional
`POMADE_CODEX_MODEL` / `POMADE_CODEX_REASONING_EFFORT` environment values apply.
Otherwise Pomade resolves the model and effort from Codex's account catalog.
Model changes reset effort to the newly chosen model's default in the picker.

Models and supported effort combinations come from official Codex `model/list`;
Pomade does not hardcode a list of model names. Discovery starts no research turn.
The helper caches the catalog for five minutes. **Refresh models** requests a new
local catalog; hosted controls reload the catalog published by the Mac companion,
which checks every minute. Its timestamp shows when the catalog was read.
Unavailable selections produce an error instead of silently choosing another model.

Every completed research action records the explicit model and effort passed to
Codex in its receipt. Cached results retain the original execution settings and
are labeled as cached. Model, effort and browser mode have distinct cache keys.
Recipe templates and portable recipe files preserve column overrides. Higher
effort can take longer and use more subscription allowance; the existing three-
minute search and four-minute browser limits still apply.

Restart both `npm run research:codex` and `npm run research:companion` after updating
this feature. The hosted queue requires the updated companion before assigning
work with reasoning settings. An already dispatched request keeps its settings;
change shared defaults between batches for consistent results across a batch.

Reference: [official Codex model discovery](https://learn.chatgpt.com/docs/app-server#models).

## Evidence and limits

On 2026-09-05, an independent CLI probe with API keys absent completed a live
HealthEdge search. The integrated Pomade run then researched HealthEdge,
Clearwater Security and Solera, returning valid typed summaries, boolean B2B
flags, and first-party citations for all three. Repeating all three reused
Pomade's cache without additional Codex requests. Inspect **DemandDrive — Codex +
free enrichment** and private `outputs/codex-and-free-enrichment.json`.

Sources and schema validation do not establish that every generated claim is
correct; review the linked evidence before using the output for qualification
or outreach. The helper confirms actual web-search events occurred, but does
not independently verify every cited claim. It has not been tested as a hosted
multi-user subscription service. The private hosted installation uses the
[outbound Mac companion](hosting.md) for this owner's research. One owner's
subscription is not a shared research pool. Mac sleep or stopping the helper
leaves hosted background research waiting for the companion to reconnect.

References: [Job Ops](https://github.com/dakheera47/Job-Ops),
[official Codex app-server](https://learn.chatgpt.com/docs/app-server),
[Codex web search](https://learn.chatgpt.com/docs/web-search),
[Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference).

## Optional local browser navigation

Set `POMADE_CODEX_BROWSER=true` to give the research agent a local Playwright
browser. It can render public pages and follow relevant links before producing
structured answers with checked source quotes and visit receipts. See
[Local browser research](local-browser-research.md) for installation, use and
limits. The browser starts automatically through the existing helper.
