# Build a workbook from a request

Choose **Build from a prompt** beside the table selector. Paste a project brief,
or choose **Use DemandDrive example**, then select **Plan workbook**. Pomade uses
the connected ChatGPT account and the saved research model
settings to propose the work.

The preview shows each sheet's purpose, research steps and output columns,
scoring rubric, routes to other sheets, assumptions, and separate tasks. Revise
the text and replan when the proposed structure needs a change. Choose **Create
sheets** to save the proposed workbook. This creates new sheets with their own
IDs. Retrying the same creation returns those sheets without replacing edits.

The first sheet contains the original request as its input row. Researched
accounts, contacts and scores start empty. In the **Workbook plan** above each
grid, use **Run step** in order. The normal research confirmation and background
runner apply. After a list is ready, choose **Preview route**, review the row
counts, then **Transfer matching rows** to populate the next sheet. Open that
sheet from the guide to continue. Each route uses a matching key to add or
update records and preserves links back to the source rows.

## The DemandDrive example

The example describes HeroDevs' ICP, three evidence-backed buying signals, a
points rubric, and buyer committee research. The planner chooses the specific
column names and sheet structure. Account discovery, evidence research,
scoring, and a separate buyer committee should all appear in its plan.

A scoring step adds a numeric total, tier and review reason. Its component
maximums must add to 100. Blank, non-numeric, fractional or out-of-range points
hold the result for review. Optional minimum evidence gates can also hold an
account. A verified zero is a real input; missing evidence is not zero. The
arithmetic is local, while the underlying evidence and awarded points still
need research and review.

## Current bounds

- Up to 5,000 characters per request, five sheets, eight steps per sheet, and
  six structured outputs per research step.
- Up to 25 list results per input row. Existing per-run provider limits apply.
- Plans support public research, list discovery, local scoring and table
  transfers in forward order. Each later sheet needs one incoming route.
- Planning uses ChatGPT in text-only mode. Research uses the installation's
  provider. Planning is one ChatGPT request;
  the later research steps consume their own allowance when run.
- Hosted ChatGPT planning waits for the updated Mac companion. The UI checks
  for the same pending result; those checks do not create additional AI calls.
- Email/mobile enrichment, CRM actions, outreach, recording and sharing appear
  as separate tasks. Creating a plan does not configure or execute them.
- The guide records the original request and steps in the saved sheets. A
  duplicate or workbook template clears the guide so it cannot navigate back
  to the original workbook. Preserve linked score columns together through a
  workbook template; single-column score templates are not supported yet.

The planning helper uses the official [Codex web search setting](https://learn.chatgpt.com/docs/config-file/config-reference) to disable browsing during planning. Research steps retain their existing evidence requirements.
