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

**Merge records** merges by CRM record ID and preserves enrichment results.
**Replace rows** replaces the rows while keeping recipe columns; it pauses an
enabled table schedule. Empty previews cannot replace existing rows. **Save source for refresh** keeps
an empty segment connected so a later refresh can import its first members. Imported
tables retain the segment ID, name, record type, extra properties and import time in source metadata.

Choose **All contacts/companies (no segment)** explicitly to use the original
unfiltered CRM preview. Salesforce's existing import options remain available.

## Refresh an imported sheet

Choose **Refresh CRM source** at the bottom of the sheet, or **Load data →
Preview latest**. Pomade reuses the saved CRM, record type, segment and extra
properties. Existing segment imports work without re-importing first. Older
unfiltered imports recover the record type when their CRM rows are unambiguous.
Salesforce imports use the same saved-source controls.

The preview shows new, updated and unchanged records. Expand **Review changed
values** to see old and incoming field values for the first ten changed records.
**Not returned · kept** counts existing records of that CRM/object type absent
from a complete preview; it does not claim they left a segment. While more pages
remain, that count is **Not checked**. Unfiltered previews still read at most 100
records and cannot load additional pages; use a HubSpot segment for larger imports.

**Merge records** updates CRM input fields, including values cleared in the CRM,
and adds new records. It preserves recipe output fields, existing run statuses,
column order and rows not returned by the source. It does not rerun enrichment.
The change summary describes merging, not replacing. Closing the dialog cancels
the pending preview; it does not change the sheet.

Active HubSpot membership can change between pages; the preview deduplicates record IDs.

For ongoing updates, open **Refresh settings**, choose **Every day** or **Every
week**, set **Maximum records per refresh** (1–1,000), and choose **Save refresh
settings**. The first automatic refresh runs shortly after saving. **Preview
changes** reads without saving the draft settings; **Refresh now** uses the last
saved settings. Closing the settings dialog discards unsaved changes.

A complete refresh marks absent records **No longer in source** and keeps their
rows. Partial reads do not claim that records left the segment. Research,
formula outputs and edits made while a refresh is in flight are preserved;
conflicting changes stay visible for review rather than silently overwriting edits.

The local app and scheduler must remain running. Hosted refreshes advance while
Pomade is open or the Mac companion is connected; missed refreshes catch up at
the next wakeup. An unattended hosted timer with both closed remains unverified.
The two installations keep independent schedules and data. See
[hosting and local execution](hosting.md).

## Connection

The existing HubSpot service key needs `crm.lists.read` (or `crm.segments.read`)
in addition to its contact/company read permissions. Creation of a test segment
uses the corresponding write scope; Pomade's import endpoints only read segments.
A missing permission produces a setup error, never an unfiltered record import.

The implementation uses HubSpot's [Lists (Segments) API](https://developers.hubspot.com/docs/api-reference/legacy/crm/lists/guide),
then batch-reads only the member IDs returned for the selected segment.
