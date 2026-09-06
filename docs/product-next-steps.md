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
4. **Refresh saved CRM sources.** Re-read a saved HubSpot segment on demand, then
   add controlled scheduled refresh. Preserve enrichment values and show records
   that joined or left the segment before deciding how to reconcile them.
5. **Easier CRM setup.** A searchable property picker and automatic Salesforce
   OAuth renewal would remove manual property-name entry and expiring-token repairs.

The segment selector is implemented in this update. The priorities above are a
roadmap, not claims of completed features. See [provider recommendations](enrichment-providers.md)
and [segment import usage](hubspot-segments.md).
