# Current capacity and next improvements

The local and hosted apps currently accept **100 total columns** and **5,000 rows
per sheet**. Input fields, action columns and output/status fields share that
column budget; there is no separate action-column quota. A provider waterfall has
**one to four provider steps** and creates **three columns**: result, winning provider
and status. For example, ten existing columns leave room for thirty waterfalls.
These are configured software limits, not a performance benchmark at the maximum.
Background runs are separately bounded to 100 rows and at most 50 external actions
per job. One research action may return multiple fields.

Most valuable next work, in order:

1. **Live phone coverage.** Prospeo mobile and LeadMagic mobile adapters are
   implemented. Verify account access and useful matches before adding budget.
   LeadMagic currently returns a format-checked number without an independent
   verification status; keep that distinction visible. Apollo's public callback
   setup is implemented, while live phone enrichment still needs eligible API access.
   See the [provider tracker](clay-contact-provider-tracker.md) for tested versus
   credential-dependent support.
2. **Cost visibility.** Display provider balances, an estimated run cost and a
   configurable spending ceiling. Report cost per additional valid result, rather
   than counting a provider no-match as a technical failure.
3. **Repeatable provider comparison.** Run the same small business-contact set
   through each provider to measure fallback value, verification differences and
   the order that gives the best result for our budget.
4. **Unattended hosted execution.** Saved CRM sources already support daily/weekly
   refresh, change previews and retained rows marked as no longer in the source.
   Verify reliable hosted timer delivery when both the browser and Mac companion
   are closed before promising fully unattended operation.
5. **Connection lifecycle.** Searchable CRM properties and readable mapping
   previews are implemented. Improve connection renewal and actionable expiry
   messages when live account testing establishes the remaining failure cases.

The segment selector, saved-source refresh and merge-change preview are implemented. The priorities above are a
roadmap, not claims of completed features. See [provider recommendations](enrichment-providers.md)
and [segment import usage](hubspot-segments.md).
