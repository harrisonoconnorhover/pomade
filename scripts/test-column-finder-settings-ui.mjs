// Standalone read-only QA. Workspace GET/PUT and provider status use synthetic data.
// Wait for the ColumnFinder settings build before running this script.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = 'http://localhost:8798';
const repo = process.cwd();
const { newTable: tableId } = JSON.parse(
  await readFile(`${repo}/outputs/nightshift/2026-09-07/csv-ui.json`, 'utf8'),
);
assert.ok(tableId, 'The disposable CSV fixture must exist.');
const researchTitle = 'Hidden buying-signal research';
const longTitle = 'Account qualification research notes and follow-up context for the sales team';
const originalPrompt = 'Find recent hiring evidence for {{company}} at {{domain}} and cite the company website.';
let fixture = {
  id: tableId,
  name: 'Night shift QA — column finder settings',
  revision: 0,
  updatedAt: 1,
  columns: [
    { id: 'company', title: 'Company', kind: 'text', width: 190 },
    { id: 'domain', title: 'Domain', kind: 'text', width: 170 },
    { id: 'long_notes', title: longTitle, kind: 'text', width: 260 },
    {
      id: 'hidden_research', title: researchTitle,
      kind: 'enrichment', recipe: 'web-research', researchProvider: 'parallel',
      prompt: originalPrompt, outputCardinality: 'single', width: 250, hidden: true,
    },
    { id: 'status', title: 'Run status', kind: 'status', width: 140 },
  ],
  rows: [{
    id: 'finder-row',
    values: {
      company: 'Synthetic finder company', domain: 'example.test',
      long_notes: 'Keep these notes', hidden_research: 'Keep this research result',
      status: 'Review',
    },
  }],
};
const originalFixture = structuredClone(fixture);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15_000);
const errors = [], consoleErrors = [], failedResponses = [];
const syntheticPuts = [], blockedWrites = [];
let workspaceReads = 0;
const screenshots = [
  'outputs/nightshift/2026-09-07/column-finder-hidden-settings.png',
  'outputs/nightshift/2026-09-07/column-finder-mobile.png',
  'outputs/nightshift/2026-09-07/column-finder-mobile-settings.png',
];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('response', (response) => {
  if (new URL(response.url()).origin === origin && response.status() >= 400)
    failedResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
});

// Every application write is mocked or blocked; nothing can reach saved data.
await page.route(`${origin}/api/**`, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const json = (value) => route.fulfill({ json: value });
  if (url.pathname === '/api/workspace' && url.searchParams.get('workspaceId') === tableId) {
    if (method === 'PUT') {
      const value = request.postDataJSON().workspace;
      syntheticPuts.push(structuredClone(value));
      fixture = { ...value, revision: (fixture.revision ?? 0) + 1 };
      return json({ workspace: fixture });
    }
    if (method === 'GET') {
      workspaceReads++;
      return json({ workspace: fixture });
    }
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    blockedWrites.push({ path: url.pathname, method });
    return route.abort('blockedbyclient');
  }
  if (url.pathname === '/api/tables') return json({ tables: [{
    id: tableId, name: fixture.name, rowCount: fixture.rows.length,
    columnCount: fixture.columns.length, recipeCount: 1, updatedAt: 1,
    sourceLabel: 'Manual workspace',
  }] });
  if (url.pathname === '/api/runs') return json({ runs: [] });
  if (url.pathname === '/api/jobs') return json({ jobs: [] });
  if (url.pathname === '/api/providers/apollo') return json({
    configured: false,
    capabilities: { personMatch: true, verifiedWorkEmail: true, phoneReveal: false },
  });
  if (url.pathname === '/api/providers/crm') return json({ providers: {
    hubspot: { configured: false, label: 'HubSpot contacts', mode: 'read_only' },
    salesforce: { configured: false, label: 'Salesforce leads', mode: 'read_only' },
  } });
  if (url.pathname === '/api/providers/research') return json({
    provider: 'parallel', configured: false, ready: false,
    label: 'Parallel', model: 'QA status only', alternatives: [],
    capabilities: { webResearch: true, citations: true, maximumActionsPerRun: 10 },
  });
  if (url.pathname === '/api/providers/research/settings') return json({
    defaults: {}, models: [], updatedAt: 0,
  });
  return route.continue();
});

const finder = () => page.getByRole('dialog', { name: 'Find a column', exact: true });
const settings = () => page.getByRole('dialog', { name: 'Column settings', exact: true });
async function openFinder(query) {
  await page.getByRole('button', { name: /^Columns / }).click();
  await finder().waitFor();
  await finder().getByLabel('Search columns', { exact: true }).fill(query);
  assert.equal(await finder().locator('.column-finder-row').count(), 1);
}
async function openSettings(title, id) {
  await finder().getByRole('button', { name: `Settings for ${title}`, exact: true }).click();
  await settings().waitFor();
  await finder().waitFor({ state: 'hidden' });
  assert.equal(await settings().getByLabel('Column name', { exact: true }).inputValue(), title);
  assert.equal((await settings().locator('.column-editor-meta code').textContent()).trim(), id);
}
async function cancelSettings() {
  await settings().getByRole('button', { name: 'Cancel', exact: true }).click();
  await settings().waitFor({ state: 'hidden' });
}
async function closeFinder() {
  await finder().getByRole('button', { name: 'Close', exact: true }).click();
  await finder().waitFor({ state: 'hidden' });
}
async function assertHorizontalFit(locator, name) {
  const box = await locator.boundingBox();
  assert.ok(box, `${name} must be visible.`);
  assert.ok(box.x >= -1 && box.x + box.width <= 391, `${name} must fit the 390px viewport.`);
}

try {
  // This explicit request bypasses browser routes and only verifies the QA fixture identity.
  const realResponse = await page.request.get(
    `${origin}/api/workspace?workspaceId=${encodeURIComponent(tableId)}`,
  );
  assert.equal(realResponse.status(), 200);
  const { workspace: savedFixture } = await realResponse.json();
  assert.match(savedFixture.name, /^Night shift QA/, 'Use only the disposable CSV fixture.');

  await page.goto(`${origin}/?table=${encodeURIComponent(tableId)}`);
  await page.getByRole('button', { name: /^Columns 4\/5/ }).waitFor();
  await openFinder('hidden buying');
  assert.equal(await finder().getByRole('checkbox', { name: `Show ${researchTitle}`, exact: true }).isChecked(), false);
  await openSettings(researchTitle, 'hidden_research');
  assert.equal(await settings().getByLabel(/^Research prompt/).inputValue(), originalPrompt);
  assert.equal(await settings().getByLabel(/^Research with/).inputValue(), 'parallel');
  await page.screenshot({ path: screenshots[0], animations: 'disabled' });
  await settings().getByLabel(/^Research prompt/).fill('Discard this draft prompt.');
  await cancelSettings();
  await openFinder('hidden buying');
  assert.equal(await finder().getByRole('checkbox', { name: `Show ${researchTitle}`, exact: true }).isChecked(), false);
  await openSettings(researchTitle, 'hidden_research');
  assert.equal(await settings().getByLabel(/^Research prompt/).inputValue(), originalPrompt);
  await cancelSettings();
  assert.equal(syntheticPuts.length, 0, 'Opening settings and cancelling must not save or unhide.');

  await openFinder('qualification follow-up');
  await openSettings(longTitle, 'long_notes');
  assert.equal(await settings().getByLabel(/^Research prompt/).count(), 0);
  assert.equal(await settings().getByRole('button', { name: 'Save name', exact: true }).isEnabled(), true);
  await settings().getByLabel('Column name', { exact: true }).fill('Discard this draft name');
  await cancelSettings();

  await page.setViewportSize({ width: 390, height: 844 });
  // The desktop sidebar remains open after resizing; dismiss its mobile drawer.
  await page.getByRole('button', { name: 'Hide navigation', exact: true }).click();
  await openFinder('qualification follow-up');
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
  const ordinarySettings = finder().getByRole('button', { name: `Settings for ${longTitle}`, exact: true });
  await ordinarySettings.scrollIntoViewIfNeeded();
  await assertHorizontalFit(finder(), 'Finder dialog');
  await assertHorizontalFit(finder().getByLabel('Search columns', { exact: true }), 'Search field');
  await assertHorizontalFit(finder().locator('.column-finder-row'), 'Long-name result row');
  await assertHorizontalFit(ordinarySettings, 'Long-name settings button');
  assert.equal(await finder().evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true, 'Finder must not overflow horizontally.');
  await page.screenshot({ path: screenshots[1], animations: 'disabled' });
  await openSettings(longTitle, 'long_notes');
  await assertHorizontalFit(settings(), 'Ordinary settings dialog');
  await assertHorizontalFit(settings().getByLabel('Column name', { exact: true }), 'Column name input');
  await cancelSettings();

  await openFinder('hidden buying');
  await openSettings(researchTitle, 'hidden_research');
  assert.equal(await settings().getByLabel(/^Research prompt/).inputValue(), originalPrompt);
  await assertHorizontalFit(settings(), 'Research settings dialog');
  await assertHorizontalFit(settings().getByLabel(/^Research prompt/), 'Research prompt');
  await settings().getByRole('button', { name: 'Cancel', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshots[2], animations: 'disabled' });
  await cancelSettings();
  await openFinder('hidden buying');
  assert.equal(await finder().getByRole('checkbox', { name: `Show ${researchTitle}`, exact: true }).isChecked(), false);
  await closeFinder();
  await page.reload();
  await page.getByRole('button', { name: /^Columns 4\/5/ }).waitFor();

  assert.ok(workspaceReads >= 2);
  assert.deepEqual(syntheticPuts, [], 'Cancel must not issue even a mocked PUT.');
  assert.deepEqual(blockedWrites, [], 'No run, provider, CRM, or other mutation should be attempted.');
  assert.deepEqual(fixture, originalFixture, 'Synthetic columns, hidden flag, prompt and row values stay intact.');
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedResponses, []);
  console.log(JSON.stringify({
    passed: true, tableId,
    checks: [
      'search opens the correct hidden research settings and prompt',
      'cancel discards draft prompt without PUT or unhiding',
      'ordinary field settings preserve the correct name and stable ID',
      'long column name and settings action fit 390px',
      'research settings and Cancel reachable on mobile',
      'reload retains hidden column and original data',
      'no provider calls, real writes, attempted mutations or browser errors',
    ],
    workspaceReads, syntheticPuts: syntheticPuts.length, blockedWrites,
    pageErrors: errors, consoleErrors, failedResponses, screenshots,
  }));
} catch (error) {
  await page.screenshot({ path: 'outputs/nightshift/2026-09-07/column-finder-settings-failure.png', animations: 'disabled' }).catch(() => {});
  console.error(JSON.stringify({
    passed: false, error: error instanceof Error ? error.message : String(error),
    syntheticPuts: syntheticPuts.length, blockedWrites, pageErrors: errors,
    consoleErrors, failedResponses,
    screenshot: 'outputs/nightshift/2026-09-07/column-finder-settings-failure.png',
  }));
  throw error;
} finally {
  await browser.close();
}
