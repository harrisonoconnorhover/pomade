// Disposable in-memory workbook; blocks real saves, execution and external requests.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
const origin = 'http://localhost:8798';
const output = 'outputs/personal-opener';
await mkdir(output, { recursive: true });
const response = await fetch(origin + '/api/tables');
assert.equal(response.status, 200);
const { tables } = await response.json();
const table = tables.find(t => /^Night shift QA/.test(t.name));
assert.ok(table, 'Use an existing disposable QA table as the browser route.');
const workspaceUrl = origin + '/api/workspace?workspaceId=' + encodeURIComponent(table.id);
const original = await (await fetch(workspaceUrl)).json();
let fixture = {
  id: table.id, name: 'Personal opener browser QA', revision: 0, updatedAt: Date.now(),
  columns: [
    { id: 'company', title: 'Company', kind: 'text', width: 180 },
    { id: 'person', title: 'Person', kind: 'text', width: 180 },
    { id: 'domain', title: 'Old domain', kind: 'text', width: 180 },
    { id: 'site_url', title: 'Website', kind: 'text', width: 200 },
    { id: 'personal_opener', title: 'Personal opener', kind: 'enrichment', recipe: 'write-opener', width: 230 },
    { id: 'status', title: 'Run status', kind: 'status', width: 140 },
  ],
  rows: [{ id: 'one', values: { company: 'Example QA', person: 'Ada', domain: 'wrong.test', site_url: 'example.com', personal_opener: 'Keep this legacy answer', status: 'Ready' } }],
};
const before = structuredClone(fixture);
const saves = [], blocked = [], errors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12000);
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  if (url.origin !== origin && ['http:', 'https:'].includes(url.protocol)) {
    blocked.push({ method: req.method(), path: url.origin }); return route.abort();
  }
  if (url.pathname === '/api/workspace' && url.searchParams.get('workspaceId') === table.id) {
    if (req.method() === 'GET') return route.fulfill({ json: { workspace: fixture } });
    if (req.method() === 'PUT') {
      fixture = structuredClone(req.postDataJSON().workspace); saves.push(structuredClone(fixture));
      return route.fulfill({ json: { workspace: fixture } });
    }
  }
  if (!['GET', 'HEAD'].includes(req.method())) {
    blocked.push({ method: req.method(), path: url.pathname });
    return route.fulfill({ status: 409, json: { error: 'QA blocks execution and real writes.' } });
  }
  if (url.pathname === '/api/jobs') return route.fulfill({ json: { jobs: [] } });
  if (url.pathname === '/api/runs') return route.fulfill({ json: { runs: [] } });
  if (url.pathname === '/api/providers/research') return route.fulfill({ json: {
    provider: 'parallel', configured: false, ready: false, label: 'Parallel', model: 'Fixture',
    alternatives: [{ provider: 'parallel', configured: false, label: 'Parallel' }, { provider: 'gemini', configured: false, label: 'Gemini' }],
    capabilities: { webResearch: true, citations: true, maximumActionsPerRun: 10 },
  } });
  if (url.pathname === '/api/providers/http') return route.fulfill({ json: { connections: {} } });
  if (url.pathname === '/api/providers/crm') return route.fulfill({ json: { providers: {
    hubspot: { configured: false, label: 'HubSpot', mode: 'read_only' },
    salesforce: { configured: false, label: 'Salesforce', mode: 'read_only' },
  } } });
  return route.continue();
});
const setup = () => page.getByRole('dialog', { name: 'Use Personal opener', exact: true });
async function openShortcut() {
  await page.getByRole('button', { name: 'Add column', exact: true }).first().click();
  const chooser = page.getByRole('dialog', { name: 'What’s the next step?', exact: true });
  await chooser.getByLabel('Search recipe library').fill('Personal opener');
  await chooser.getByRole('button').filter({ has: page.getByText('Personal opener', { exact: true }) }).click();
  await setup().waitFor();
}
try {
  await page.goto(origin + '/?table=' + table.id);
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  await openShortcut();
  const defaultPrompt = await setup().getByLabel('Research prompt', { exact: true }).inputValue();
  assert.match(defaultPrompt, /Insufficient evidence/);
  assert.match(defaultPrompt, /exact supporting quotation/);
  await setup().getByLabel('Research prompt', { exact: true }).fill('Cancelled draft');
  await setup().getByRole('button', { name: 'Cancel', exact: true }).click();
  await delay(700);
  assert.equal(saves.length, 0);
  assert.deepEqual(fixture, before);

  await openShortcut();
  assert.equal(await setup().getByLabel('Research prompt', { exact: true }).inputValue(), defaultPrompt);
  const website = setup().getByLabel(/Company website or domain/);
  await website.selectOption('');
  assert.equal(await setup().getByRole('button', { name: 'Add function', exact: true }).isEnabled(), false);
  await website.selectOption('site_url');
  await setup().getByLabel('Research with').selectOption('parallel');
  const customized = defaultPrompt + '\nUse a plain, curious tone.';
  await setup().getByLabel('Research prompt', { exact: true }).fill(customized);
  await setup().getByLabel('Research focus (optional)').fill('Relevant to sales operations.');
  await page.setViewportSize({ width: 390, height: 844 });
  await setup().getByRole('button', { name: 'Add function', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/setup-mobile.png', animations: 'disabled' });
  assert.ok(await setup().evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  const saving = page.waitForResponse(r => r.url() === workspaceUrl && r.request().method() === 'PUT');
  await setup().getByRole('button', { name: 'Add function', exact: true }).click();
  assert.equal((await saving).status(), 200);
  await setup().waitFor({ state: 'hidden' });
  assert.equal(saves.length, 1);
  const added = fixture.columns.filter(c => !before.columns.some(old => old.id === c.id));
  assert.equal(added.length, 4);
  const research = added.find(c => c.recipe === 'web-research');
  assert.ok(research);
  assert.equal(research.researchProvider, 'parallel');
  assert.equal(research.autoRun, false);
  assert.equal(research.inputBindings.domain, 'site_url');
  assert.deepEqual(research.runCondition, { field: 'site_url', operator: 'is_not_empty' });
  assert.equal(research.prompt, customized + '\n\nResearch focus: Relevant to sales operations.');
  assert.deepEqual(fixture.columns.filter(c => before.columns.some(old => old.id === c.id)), before.columns);
  for (const [key, value] of Object.entries(before.rows[0].values)) assert.equal(fixture.rows[0].values[key], value);
  assert.ok(added.every(c => fixture.rows[0].values[c.id] === ''));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.getByRole('button', { name: /^Columns / }).click();
  await page.getByLabel('Search columns', { exact: true }).fill('Personal opener');
  await page.getByRole('button', { name: 'Settings for Personal opener', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Column settings', exact: true });
  await settings.getByText(/Legacy template opener:/).waitFor();
  await page.screenshot({ path: output + '/legacy-desktop.png', animations: 'disabled' });
  await settings.getByRole('button', { name: 'Add researched opener', exact: true }).click();
  await setup().waitFor();
  await setup().getByRole('button', { name: 'Cancel', exact: true }).click();
  await delay(700);
  assert.equal(saves.length, 1, 'Legacy adoption must remain deliberate.');
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  assert.deepEqual(await (await fetch(workspaceUrl)).json(), original, 'Actual saved QA sheet must remain unchanged.');
  const result = { passed: true, syntheticSaves: saves.length, actualWrites: 0, providerExecutions: 0, pageErrors: errors,
    checks: ['Shortcut opens research setup', 'Cancel preserves data', 'Required website mapping gates Add', 'Editable prompt and provider survive mapped save/reload', 'Four blank outputs created without research despite unavailable provider', '390px setup fits', 'Legacy values/recipe retained with deliberate adoption action'] };
  await writeFile(output + '/ui.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: output + '/failure.png' }); throw error;
} finally { await browser.close(); }
