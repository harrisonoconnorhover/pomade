# Import a HubSpot segment

Open a sheet, choose **Load data**, then choose **contact** or **company** under
HubSpot. The **HubSpot segment** dropdown loads all accessible segments for that
record type, including active and static segments. Refresh it after creating or
renaming a segment in HubSpot.

Choose a segment and optional additional CRM properties, then **Preview up to
100**. Segment discovery does not fetch the underlying contacts or companies.
**Load next 100** collects another page into the preview when more members exist.
The preview clearly indicates when it is only part of the segment. Tables retain
the existing 5,000-row capacity.

**Append records** merges by CRM record ID and preserves enrichment results.
**Replace rows** replaces the rows while keeping recipe columns; it pauses an
enabled table schedule. Empty previews cannot replace existing rows. Imported
tables retain the segment ID, name, record type and import time in source metadata.

Choose **All contacts/companies (no segment)** explicitly to use the original
unfiltered CRM preview. Salesforce's existing import options remain available.

The saved source is a snapshot. Active HubSpot segment membership can change
between pages; the preview deduplicates record IDs. Automatic segment refresh,
removal of records that leave a segment, and refresh scheduling are future work.

## Connection

The existing HubSpot service key needs `crm.lists.read` (or `crm.segments.read`)
in addition to its contact/company read permissions. Creation of a test segment
uses the corresponding write scope; Pomade's import endpoints only read segments.
A missing permission produces a setup error, never an unfiltered record import.

The implementation uses HubSpot's [Lists (Segments) API](https://developers.hubspot.com/docs/api-reference/legacy/crm/lists/guide),
then batch-reads only the member IDs returned for the selected segment.
