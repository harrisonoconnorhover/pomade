// Standalone read-only QA. Workspace GET/PUT and provider status use synthetic data.
// Research column model and effort draft/save QA. No real writes or research execution.
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
  name: 'Night shift QA — research model settings',
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
let settingsReads = 0;
const settingsRefreshQueries = [];
const screenshots = [
  'outputs/nightshift/2026-09-07/research-model-settings-desktop.png',
  'outputs/nightshift/2026-09-07/research-model-settings-mobile.png',
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
    label: 'Parallel', model: 'QA status only', alternatives: [{ provider: 'codex', configured: false, label: 'ChatGPT subscription' }],
    capabilities: { webResearch: true, citations: true, maximumActionsPerRun: 10 },
  });
  if (url.pathname === '/api/providers/research/settings') {
    settingsReads++;
    settingsRefreshQueries.push(url.searchParams.get('refresh'));
    if (settingsReads === 1) return route.fulfill({ status: 503, json: { error: 'Synthetic model lookup unavailable.' } });
    return json({ defaults: {}, models: [{
      id: 'qa-model-a', name: 'QA model A', isDefault: true,
      defaultReasoningEffort: 'medium',
      efforts: [{ value: 'medium', description: '' }, { value: 'high', description: '' }],
    }], updatedAt: 0 });
  }
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

const inherit = () => settings().getByRole('checkbox', { name: 'Use app defaults', exact: true });
const model = () => settings().getByRole('combobox', { name: `${researchTitle} research model`, exact: true });
const effort = () => settings().getByRole('combobox', { name: `${researchTitle} research reasoning effort`, exact: true });
const researchColumn = () => fixture.columns.find((column) => column.id === 'hidden_research');
async function openResearchSettings() {
  await openFinder('hidden buying');
  assert.equal(await finder().getByRole('checkbox', { name: `Show ${researchTitle}`, exact: true }).isChecked(), false);
  await openSettings(researchTitle, 'hidden_research');
  assert.equal(await settings().getByLabel(/^Research prompt/).inputValue(), originalPrompt);
}
async function chooseExplicitModel() {
  await settings().getByLabel(/^Research with/).selectOption('codex');
  await inherit().uncheck();
  await model().selectOption('qa-model-a');
  await effort().selectOption('high');
  assert.equal(await inherit().isChecked(), false);
  assert.equal(await model().inputValue(), 'qa-model-a');
  assert.equal(await effort().inputValue(), 'high');
}
async function saveSettings(expectedPutCount) {
  const pending = page.waitForResponse((response) => {
    const request = response.request();
    return new URL(response.url()).pathname === '/api/workspace' && request.method() === 'PUT';
  });
  await settings().getByRole('button', { name: 'Save settings', exact: true }).click();
  await settings().waitFor({ state: 'hidden' });
  const response = await pending;
  assert.equal(response.status(), 200);
  await page.locator('.sync-state.sync-saved').waitFor();
  assert.equal(syntheticPuts.length, expectedPutCount);
}
function assertPreservedData() {
  assert.deepEqual(fixture.rows, originalFixture.rows, 'Settings must not change any row result or notes.');
  assert.deepEqual(fixture.columns.filter((column) => column.id !== 'hidden_research'), originalFixture.columns.filter((column) => column.id !== 'hidden_research'));
  assert.equal(researchColumn().hidden, true);
  assert.equal(researchColumn().prompt, originalPrompt);
  assert.equal(researchColumn().title, researchTitle);
  assert.equal(researchColumn().outputCardinality, 'single');
}
try {
  // Explicit request bypasses browser interception only to verify disposable fixture identity.
  const realResponse = await page.request.get(`${origin}/api/workspace?workspaceId=${encodeURIComponent(tableId)}`);
  assert.equal(realResponse.status(), 200);
  const { workspace: savedFixture } = await realResponse.json();
  assert.match(savedFixture.name, /^Night shift QA/, 'Use only the disposable CSV fixture.');
  await page.goto(`${origin}/?table=${encodeURIComponent(tableId)}`);
  await page.getByRole('button', { name: /^Columns 4\/5/ }).waitFor();

  await openResearchSettings();
  assert.equal(settingsReads, 0, 'An unconfigured Codex provider must not be queried before choosing it.');
  const draftPrompt = 'Preserve this unsaved question while retrying the model list for {{company}}.';
  await settings().getByLabel(/^Research prompt/).fill(draftPrompt);
  await settings().getByLabel(/^Research with/).selectOption('codex');
  const modelError = settings().getByRole('alert').filter({ hasText: 'Research settings could not be loaded.' });
  await modelError.waitFor();
  assert.equal(settingsReads, 1, 'Choosing Codex must request account models even when the provider status says unconfigured.');
  assert.equal(await settings().getByLabel(/^Research prompt/).inputValue(), draftPrompt, 'Model loading failure must retain the unsaved prompt.');
  assert.equal(syntheticPuts.length, 0);
  await settings().getByRole('button', { name: 'Refresh models', exact: true }).click();
  await model().locator('option[value="qa-model-a"]').waitFor({ state: 'attached' });
  await modelError.waitFor({ state: 'hidden' });
  assert.deepEqual(settingsRefreshQueries, ['false', 'true'], 'Refresh models must retry with refresh=true.');
  assert.equal(await settings().getByLabel(/^Research prompt/).inputValue(), draftPrompt, 'Successful model refresh must retain the unsaved prompt.');
  assert.equal(syntheticPuts.length, 0, 'Model refresh must not save draft settings.');
  await chooseExplicitModel();
  assert.equal(await settings().getByLabel(/^Research prompt/).inputValue(), draftPrompt);
  await cancelSettings();
  // Cover the workspace autosave debounce so a cancelled draft cannot sneak into a later save.
  await page.waitForTimeout(650);
  assert.equal(syntheticPuts.length, 0, 'Cancelled provider/model/effort drafts must not issue a workspace PUT.');
  assert.deepEqual(fixture, originalFixture);
  await openResearchSettings();
  assert.equal(await settings().getByLabel(/^Research with/).inputValue(), 'parallel');
  assert.equal(await inherit().count(), 0, 'Cancelled Codex provider choice must not persist.');
  await settings().getByLabel(/^Research with/).selectOption('codex');
  assert.equal(await inherit().isChecked(), true);
  assert.equal(await model().isDisabled(), true);
  assert.equal(await effort().isDisabled(), true);
  await chooseExplicitModel();
  await page.screenshot({ path: screenshots[0], animations: 'disabled' });
  await saveSettings(1);
  assert.equal(researchColumn().researchProvider, 'codex');
  assert.deepEqual(researchColumn().codexResearch, { model: 'qa-model-a', reasoningEffort: 'high' });
  assertPreservedData();

  await openResearchSettings();
  assert.equal(await settings().getByLabel(/^Research with/).inputValue(), 'codex');
  assert.equal(await inherit().isChecked(), false);
  assert.equal(await model().inputValue(), 'qa-model-a');
  assert.equal(await effort().inputValue(), 'high');
  await inherit().check();
  assert.equal(await model().isDisabled(), true);
  assert.equal(await effort().isDisabled(), true);
  await saveSettings(2);
  assert.equal(researchColumn().codexResearch, undefined, 'Inheritance must remove the per-column override.');
  assert.equal(Object.hasOwn(syntheticPuts.at(-1).columns.find((column) => column.id === 'hidden_research'), 'codexResearch'), false, 'JSON request must omit inherited model settings.');
  assertPreservedData();

  await openResearchSettings();
  assert.equal(await inherit().isChecked(), true);
  await inherit().uncheck();
  assert.equal(await model().inputValue(), '');
  assert.equal(await effort().inputValue(), '');
  assert.equal(await model().isEnabled(), true);
  assert.equal(await effort().isEnabled(), true);
  await saveSettings(3);
  assert.deepEqual(researchColumn().codexResearch, {}, 'Explicit Codex defaults must save as {} even when app defaults are {}.');
  assertPreservedData();

  await page.reload();
  await page.getByRole('button', { name: /^Columns 4\/5/ }).waitFor();
  await openResearchSettings();
  assert.equal(await inherit().isChecked(), false, 'Explicit {} must remain different from inherited defaults after reload.');
  assert.equal(await model().inputValue(), '');
  assert.equal(await effort().inputValue(), '');
  await cancelSettings();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Hide navigation', exact: true }).click();
  await openResearchSettings();
  await model().selectOption('qa-model-a');
  await effort().selectOption('high');
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
  for (const [locator, name] of [
    [settings(), 'Research settings dialog'],
    [settings().getByLabel(/^Research with/), 'Research provider'],
    [inherit(), 'Use app defaults checkbox'],
    [model(), 'Model select'],
    [effort(), 'Effort select'],
    [settings().getByRole('button', { name: 'Refresh models', exact: true }), 'Refresh models'],
    [settings().getByRole('button', { name: 'Save settings', exact: true }), 'Save settings'],
    [settings().getByRole('button', { name: 'Cancel', exact: true }), 'Cancel'],
  ]) {
    await locator.scrollIntoViewIfNeeded();
    await assertHorizontalFit(locator, name);
  }
  assert.equal(await settings().evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true, 'Mobile settings must not overflow horizontally.');
  await model().scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshots[1], animations: 'disabled' });
  await cancelSettings();
  await page.waitForTimeout(650);
  assert.equal(syntheticPuts.length, 3, 'Mobile cancelled draft must not save.');
  assert.deepEqual(researchColumn().codexResearch, {});
  assertPreservedData();

  assert.ok(workspaceReads >= 2);
  assert.ok(settingsReads >= 2, 'The synthetic model list must be retried and loaded.');
  assert.deepEqual(blockedWrites, [], 'No execution, provider defaults, CRM, or other mutation may be attempted.');
  assert.deepEqual(errors, []);
  assert.equal(consoleErrors.length, 1, 'Only the deliberately failed model request may log a console error.');
  assert.match(consoleErrors[0], /Failed to load resource.*503/);
  assert.deepEqual(failedResponses, [{ path: '/api/providers/research/settings', status: 503 }]);
  console.log(JSON.stringify({
    passed: true, tableId,
    checks: [
      'Choosing unconfigured Codex loads models, reports one 503 and offers Refresh models',
      'Refresh models retries successfully and retains the unsaved prompt',
      'provider, model and effort changes remain drafts until Save',
      'Cancel issues no PUT and restores original provider and inheritance',
      'Save and reopen preserve the explicit model and high effort',
      'Use app defaults removes codexResearch from the saved column',
      'Explicit default settings {} stay distinct from inheritance, including after reload',
      'Original research prompt, hidden state, output shape and all row results remain intact',
      '390px controls fit and mobile Cancel discards draft model changes',
      'Only three intercepted workspace PUTs; no provider execution or unexpected browser errors',
    ],
    workspaceReads, settingsReads, settingsRefreshQueries, syntheticPuts: syntheticPuts.length,
    blockedWrites, pageErrors: errors, consoleErrors, failedResponses, screenshots,
  }));
} catch (error) {
  const screenshot = 'outputs/nightshift/2026-09-07/research-model-settings-failure.png';
  await page.screenshot({ path: screenshot, animations: 'disabled' }).catch(() => {});
  console.error(JSON.stringify({
    passed: false, error: error instanceof Error ? error.message : String(error),
    workspaceReads, settingsReads, settingsRefreshQueries, syntheticPuts: syntheticPuts.length,
    lastColumn: researchColumn(), blockedWrites, pageErrors: errors,
    consoleErrors, failedResponses, screenshot,
  }));
  throw error;
} finally {
  await browser.close();
}
