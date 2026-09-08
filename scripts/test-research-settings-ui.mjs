// Draft only: run after the updated localhost:8798 build is ready.
// Workspace GET/PUT are synthetic. No saved sheet or provider is mutated.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const repo = process.cwd();
const origin = 'http://localhost:8798';
const { newTable: tableId } = JSON.parse(
  await readFile(repo + '/outputs/nightshift/2026-09-07/csv-ui.json', 'utf8'),
);
assert.ok(tableId, 'The disposable CSV fixture must already exist.');
const workspaceUrl = origin + '/api/workspace?workspaceId=' + tableId;
async function readRealWorkspace() {
  const response = await fetch(workspaceUrl);
  assert.equal(response.status, 200);
  return (await response.json()).workspace;
}
const before = await readRealWorkspace();
assert.match(before.name, /^Night shift QA/);

const researchId = 'qa_research';
const originalPrompt =
  'Summarize the offering of {{company}} using public sources.';
const updatedPrompt =
  'Find current sales hiring at {{company}} and explain why it matters.';
const outputFields = [
  { id: researchId, title: 'Company research', valueType: 'text' },
  { id: 'qa_evidence', title: 'Research evidence', valueType: 'text' },
];
let fixture = {
  ...structuredClone(before),
  columns: [
    { id: 'company', title: 'Company', kind: 'text', width: 180 },
    {
      id: researchId,
      title: 'Company research',
      kind: 'enrichment',
      recipe: 'web-research',
      width: 260,
      prompt: originalPrompt,
      researchProvider: 'parallel',
      outputFields: structuredClone(outputFields),
      inputBindings: { company: 'company' },
    },
    { id: 'qa_evidence', title: 'Research evidence', kind: 'text', width: 230 },
    { id: 'domain', title: 'Domain', kind: 'text', width: 180 },
    { id: 'status', title: 'Run status', kind: 'status', width: 140 },
  ],
  rows: [
    {
      id: 'qa-research-settings-1',
      values: {
        company: 'Research settings QA',
        domain: 'example.test',
        [researchId]:
          'An existing researched answer that must survive settings edits.',
        qa_evidence: 'https://example.test/about',
        status: 'Ready',
      },
    },
    {
      id: 'qa-research-settings-2',
      values: {
        company: 'Second research settings QA',
        domain: 'second.example.test',
        [researchId]: 'A second existing answer.',
        qa_evidence: 'https://second.example.test/about',
        status: 'Ready',
      },
    },
  ],
  source: undefined,
  schedule: undefined,
  workbookPlan: undefined,
  tableTransfers: undefined,
};
// Normalize away undefined keys to match the JSON crossing the API boundary.
fixture = JSON.parse(JSON.stringify(fixture));
const initialFixture = structuredClone(fixture);
const saves = [];
const blockedRequests = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12_000);
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  if (url.origin === origin && url.pathname === '/api/workspace') {
    if (url.searchParams.get('workspaceId') === tableId) {
      if (method === 'GET')
        return route.fulfill({ json: { workspace: fixture } });
      if (method === 'PUT') {
        const payload = request.postDataJSON();
        assert.equal(payload.workspace.id, tableId);
        saves.push(structuredClone(payload.workspace));
        fixture = structuredClone(payload.workspace);
        return route.fulfill({ json: { workspace: fixture } });
      }
    }
  }
  if (url.origin === origin && method === 'GET') {
    if (url.pathname === '/api/jobs')
      return route.fulfill({ json: { jobs: [] } });
    if (url.pathname === '/api/runs')
      return route.fulfill({ json: { runs: [] } });
    if (url.pathname === '/api/providers/research') {
      return route.fulfill({
        json: {
          provider: 'parallel',
          configured: true,
          ready: true,
          label: 'Parallel',
          model: 'QA synthetic status',
          alternatives: [
            { provider: 'parallel', configured: true, label: 'Parallel' },
            { provider: 'gemini', configured: true, label: 'Gemini' },
            { provider: 'codex', configured: false, label: 'ChatGPT' },
          ],
          capabilities: {
            webResearch: true,
            citations: true,
            maximumActionsPerRun: 10,
          },
        },
      });
    }
  }
  if (!['GET', 'HEAD'].includes(method)) {
    blockedRequests.push({ method, path: url.pathname });
    return route.fulfill({
      status: 409,
      json: { error: 'This read-only UI test blocks execution.' },
    });
  }
  if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
    blockedRequests.push({ method, path: url.origin + url.pathname });
    return route.abort();
  }
  return route.continue();
});

const settingsDialog = () =>
  page.getByRole('dialog', { name: 'Column settings', exact: true });
async function openResearchSettings() {
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible' });
  const box = await canvas.boundingBox();
  assert.ok(box);
  // Glide grid: 52px row marker + 180px Company column + research header.
  await page.mouse.click(box.x + 52 + 180 + 90, box.y + 20, {
    button: 'right',
  });
  await page
    .getByRole('menuitem', { name: 'Column settings', exact: true })
    .click();
  const dialog = settingsDialog();
  await dialog.waitFor();
  assert.equal(
    await dialog.getByLabel('Column name', { exact: true }).inputValue(),
    'Company research',
  );
  return dialog;
}
async function assertRunButtons(dialog, enabled) {
  assert.equal(
    await dialog
      .getByRole('button', { name: 'Run now', exact: true })
      .isEnabled(),
    enabled,
  );
  assert.equal(
    await dialog
      .getByRole('button', { name: 'Queue', exact: true })
      .isEnabled(),
    enabled,
  );
}
async function cancel(dialog) {
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  // Autosave has a 500ms debounce. Wait beyond it to detect an unintended save.
  await delay(800);
}

try {
  await page.goto(origin + '/?table=' + tableId);
  let dialog = await openResearchSettings();
  const prompt = () => settingsDialog().getByLabel(/^Research prompt/);
  const provider = () => settingsDialog().getByLabel(/^Research with/);
  assert.equal(await prompt().inputValue(), originalPrompt);
  assert.equal(await provider().inputValue(), 'parallel');
  await assertRunButtons(dialog, true);

  // Provider-only edits are drafts, as are prompt-only edits.
  await provider().selectOption('gemini');
  await assertRunButtons(dialog, false);
  await provider().selectOption('parallel');
  await assertRunButtons(dialog, true);
  await prompt().fill('An unsaved prompt for {{company}}.');
  await assertRunButtons(dialog, false);
  await provider().selectOption('gemini');
  await cancel(dialog);
  assert.equal(saves.length, 0, 'Cancel must not trigger a workspace PUT.');
  assert.deepEqual(fixture, initialFixture);

  dialog = await openResearchSettings();
  assert.equal(await prompt().inputValue(), originalPrompt);
  assert.equal(await provider().inputValue(), 'parallel');
  await prompt().fill(updatedPrompt);
  await provider().selectOption('gemini');
  await assertRunButtons(dialog, false);
  const savedResponse = page.waitForResponse(
    (response) =>
      response.url() === workspaceUrl && response.request().method() === 'PUT',
  );
  await dialog
    .getByRole('button', { name: 'Save settings', exact: true })
    .click();
  assert.equal((await savedResponse).status(), 200);
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(saves.length, 1);
  const saved = saves[0];
  const savedColumn = saved.columns.find((column) => column.id === researchId);
  assert.equal(savedColumn.prompt, updatedPrompt);
  assert.equal(savedColumn.researchProvider, 'gemini');
  assert.deepEqual(savedColumn.outputFields, outputFields);
  assert.deepEqual(
    savedColumn.inputBindings,
    initialFixture.columns[1].inputBindings,
  );
  assert.deepEqual(
    saved.columns.map((column) => column.id),
    initialFixture.columns.map((column) => column.id),
  );
  assert.deepEqual(
    saved.columns.filter((column) => column.id !== researchId),
    initialFixture.columns.filter((column) => column.id !== researchId),
  );
  assert.deepEqual(
    saved.rows,
    initialFixture.rows,
    'Saving settings must preserve existing results and row IDs.',
  );

  // Reload consumes the intercepted saved snapshot, then reopens a fresh draft.
  await page.reload();
  dialog = await openResearchSettings();
  assert.equal(await prompt().inputValue(), updatedPrompt);
  assert.equal(await provider().inputValue(), 'gemini');
  await assertRunButtons(dialog, true);
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/research-settings-desktop.png',
    animations: 'disabled',
  });
  await prompt().fill('   ');
  assert.equal(
    await dialog
      .getByRole('button', { name: 'Save settings', exact: true })
      .isEnabled(),
    false,
  );
  await assertRunButtons(dialog, false);
  await cancel(dialog);
  assert.equal(saves.length, 1, 'Discarding a blank prompt must not save.');

  dialog = await openResearchSettings();
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.waitFor({ state: 'visible' });
  await prompt().scrollIntoViewIfNeeded();
  const bounds = await dialog.boundingBox();
  assert.ok(bounds);
  assert.ok(
    bounds.x >= -1 && bounds.x + bounds.width <= 391,
    'Settings dialog must fit a 390px phone viewport.',
  );
  assert.ok(
    bounds.y >= -1 && bounds.y + bounds.height <= 845,
    'Settings dialog must stay within phone height and scroll internally.',
  );
  const overflow = await dialog.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    'Settings contents must not overflow horizontally.',
  );
  const promptBounds = await prompt().boundingBox();
  assert.ok(
    promptBounds &&
      promptBounds.x >= -1 &&
      promptBounds.x + promptBounds.width <= 391,
  );
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/research-settings-mobile.png',
    animations: 'disabled',
  });
  await dialog
    .getByRole('button', { name: 'Save settings', exact: true })
    .scrollIntoViewIfNeeded();
  await cancel(dialog);

  assert.equal(saves.length, 1);
  assert.deepEqual(
    blockedRequests,
    [],
    'The settings workflow must not attempt provider execution or other writes.',
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(
    await readRealWorkspace(),
    before,
    'The actual saved fixture must remain unchanged.',
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        fixture: tableId,
        interceptedPuts: saves.length,
        savedDataWrites: 0,
        checks: [
          'Second-column right-click opens the correct research settings',
          'Saved prompt and provider initialize the edit draft',
          'Prompt or provider edits disable both run controls until saved',
          'Cancel changes no workspace and sends no PUT',
          'Save updates prompt/provider and preserves columns, mappings, outputs and existing results',
          'Reload and reopen reflect the saved settings',
          'Blank research prompt disables Save settings',
          '390px mobile settings fit without horizontal overflow',
          'No provider calls, external writes or real fixture mutations',
        ],
        pageErrors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/research-settings-failure.png',
    animations: 'disabled',
  });
  throw error;
} finally {
  await browser.close();
}
