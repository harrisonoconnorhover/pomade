# Everyday work in Pomade

Local and hosted Pomade use the same interface but keep separate saved sheets
and connections. Check the Local/Hosted label before importing data.

## Start with data

Use **Load data** for a CSV, HubSpot or Salesforce. CSV imports show a preview
and default to **Create a new sheet**. Choose **Add rows to this sheet** only
when you want to append; map each incoming field to an existing data column,
a new column, or Skip. Appending does not replace existing rows. CSV files are
limited to 2 MB; each sheet supports 5,000 rows and 100 total columns.

For HubSpot, choose contacts or companies, select a segment from the dropdown,
and preview it before merging. See the [segment guide](hubspot-segments.md) for
paging and saved refresh settings. CRM imports read data; writing back is a
separate flow.

## Add the next step

Right-click the grid or a column header, or use **Add column** at the far right.
Choose a data field, email/phone enrichment, AI research, a formula, or a lookup.
The provider catalog shows required inputs and connection status. Configuring
a column does not run it or consume enrichment credits.

AI research can return one answer, several typed fields, or a list of rows.
Your custom prompt and field choices survive switching output formats. For
repeatable hiring, funding, technology or team research, start with the buying
signal recipes in **Recipe library** and save your customized column as a template.

Use **Columns** to search, jump, hide or show fields. Hidden columns retain their
values and still participate in recipes. The settings button beside each search
result opens that column directly, including hidden columns. In **Column settings**,
you can edit an existing research prompt or provider, or reorder an existing
provider waterfall. For model and effort controls, choose **ChatGPT subscription**
under **Research with**, then uncheck **Use app defaults**. If the model list
cannot load, **Refresh models** retries without discarding your draft. **Cancel** discards the draft; **Save settings**
keeps the existing outputs and answers. Changed recipes pause an enabled schedule
for review. A waiting waterfall run must finish or be cancelled before reordering.

Every output and status field counts
toward the 100-column limit; builders explain when the chosen setup will not fit.

## Run a deliberate scope

Check the rows you want, or filter the sheet before running. The Run button
shows the row count. **Filter** opens explicit status and saved-view choices;
search text combines with the chosen filter. **Clear filters** returns to all rows.
For external actions, review the selected action columns,
missing inputs, connection checks and maximum provider submissions. You can
switch to background execution in the same dialog. No selected actions means
nothing can run. Local-only formula and lookup sheets run directly.

Waterfalls try providers in order until a result meets your acceptance rules.
Optional verification also counts toward the request limit. A configured API
key does not guarantee that your vendor plan permits every action. Background
runs retain completed steps and expose waiting, pause, resume and retry states.
Use **Run history** to inspect outcomes and evidence. Long receipts have Previous
and Next pages with 100 actions per page. Search by company, action, result or
error, or choose **Needs review** to focus on unresolved actions. Filtering resets
to the first page; the summary totals continue to cover the full run.

Arrow keys keep **Details** aligned with the selected row. A source-row link opens
the correct record and scrolls to it, even far down a sheet.

## Reuse data and write it back

**Lookup another table** reads the latest saved source values without provider
credits. Automatic matching uses domain rules for recognized domain fields and
case-insensitive text otherwise. Preview the result, then add and run the column.
**Send → Transfer to table** maps records into another sheet; preview additions and updates
before applying. The selection checkbox stays explicit even when no rows are checked.

For CRM writes, open **Send → Write to CRM**, map fields, and review the proposed
changes and row count before confirming. Completed batches show verified values
and can be reopened without repeating the write.

Use **More → Export CSV** to choose Selected rows, Current view, or Entire sheet.
Exports default to visible columns; select **Include hidden columns** when needed.
On a narrow screen, **Hide navigation** frees space for the grid.

Wait for **Saved** before leaving a sheet. If saving fails, retry it before
switching. Local scheduled work needs the local server; hosted background work
currently needs the open site or connected Mac companion. Hosted recipe schedules
also require explicit enablement; they start disabled. See
[execution and hosting details](hosting.md).
