# Local browser research

Pomade can now use Playwright and local Chromium to visit public websites while
the existing Codex research agent chooses which pages to read. This supplies the
browser loop for custom account research: company domain + question → rendered
pages and relevant links → structured table fields and source evidence.

Clay's own [Claygent lesson](https://university.clay.com/lessons/enriching-with-claygent)
describes this domain-and-prompt workflow. A local browser is practical for our
personal batches; we do not need Clay's large-scale hosting infrastructure to
implement it. That does not establish identical coverage or research accuracy.

## Use it

From the Pomade repository:

```sh
npm install --legacy-peer-deps
npm run research:browser:install
```

Set these values in private `.env.local`, using the existing Codex helper token:

```dotenv
POMADE_RESEARCH_PROVIDER=codex
POMADE_CODEX_BROWSER=true
```

Run `npm run research:codex` in one terminal. Rebuild Pomade and start its local
preview in another terminal:

```sh
npm run build
npm run start -- --port 8798
```

Stop an older helper/preview before starting its replacement. The browser itself
starts and closes automatically for each research request. Codex retains its own
ChatGPT login; Pomade does not copy that login or switch to API billing. To return
to search-only Codex research, set `POMADE_CODEX_BROWSER=false`, rebuild and restart
the preview. Parallel and Gemini remain available through the existing setting.

Add a web-research column with a question such as:

> Visit https://{{domain}} and follow a relevant product or solutions link.
> Summarize the primary product offering, identify the target customer, and
> determine whether the company sells to businesses. Use null if the inspected
> pages do not establish the answer. Cite exact source quotations.

Choose typed output fields in the existing recipe editor, then run selected rows.
The same recipe can be called through Pomade's existing `run_recipe` MCP tool.
Keep synchronous browser runs small, preferably one account per MCP call.

The research editor, company/people finders, run confirmation and Sources
(**Load data**) panel include **Check again**. Use it after starting the helper or repairing its
setup; the saved table can load and remain editable while the connection is
checked. Local-browser readiness, installation errors and login errors are shown
separately. Run receipts link each source quotation to its page and expose the
recorded error or rejection reason under result/provider details.

## What happens

1. Pomade renders the question using the row's domain and other inputs.
2. Its local Codex helper starts a fresh browser MCP process. The model can use
   live search to locate URLs, then opens public pages through Playwright.
3. The browser returns JavaScript-rendered visible text and link URLs. The model
   chooses relevant links and opens their pages, up to six page attempts.
4. The model returns the requested structured fields and source quotations.
   Pomade keeps a citation only when its final URL was successfully visited and
   its quotation appears in the text returned from that page.
5. The existing pipeline validates output types, saves results and citations,
   records browser visits and caches the research. Browser mode has a distinct
   cache identity, so an old search-only answer cannot substitute for a visit.

Open the run receipt's **Browser visits** section to inspect page outcomes,
timestamps and checked quotations. The API/MCP returns the same visit history.
Hidden row evidence also preserves visits and quotes. Whole page text is temporary
and removed with the research job; the durable record retains the quotations and
visit metadata. A matching quotation verifies what was read, not every inference
made from it. Review the source context for consequential conclusions.

## Bounds in this version

- One research job at a time, six page attempts per account and a four-minute
  agent deadline. Each page has a navigation timeout. Only the first 16,000 visible
  characters and 80 links are returned; truncated pages are marked in the receipt.
- An isolated browser context reads public pages. It does not borrow the user's
  signed-in Chrome cookies, submit forms, download files, click arbitrary
  controls or solve challenges. Non-read HTTP methods, private-network requests,
  service workers and WebSockets are blocked. Images/media/fonts are skipped.
- Blocked, rate-limited and failed pages are recorded as such and cannot support
  a citation. Unestablished facts should remain null/unknown. A result with no
  supported citations stays in review instead of passing the evidence check.
- A running browser job is not checkpointed mid-page across a helper crash.
  Completed rows remain saved through Pomade's existing pipeline and receipts.
  Reconnect/check receipts after a timeout before retrying.
- This is the Codex/ChatGPT-subscription implementation. Arbitrary BYO LLM keys,
  authenticated-site sessions and broader browser interactions remain future
  extensions, not prerequisites for these public-site research batches.

The browser uses the [official Playwright library](https://playwright.dev/docs/library)
and the [official MCP SDK](https://ts.sdk.modelcontextprotocol.io/). The agent uses
Codex's [MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) with
only the public page reader enabled, while shell, plugins and private connectors
remain disabled for that child research process.
