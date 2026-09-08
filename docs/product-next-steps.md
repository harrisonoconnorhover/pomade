# Current capacity and next improvements

The local and hosted apps currently accept **100 total columns** and **5,000 rows
per sheet**. Input fields, action columns and output/status fields share that
column budget; there is no separate action-column quota. A provider waterfall has
**two to four providers** and creates **three columns**: result, winning provider
and status. For example, ten existing columns leave room for thirty waterfalls.
These are configured software limits, not a performance benchmark at the maximum.
Background runs are separately bounded to 100 rows and at most 50 external actions
per job. One research action may return multiple fields.

Most valuable next work, in order:

1. **Real phone coverage and clear phone types.** Extend Prospeo mobile support if
   the current account permits it; add LeadMagic as the first independent mobile
   fallback. Keep mobile and office phone fields separate, with source and check date.
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
