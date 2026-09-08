// Draft only: run after the explicit row-filter dropdown build is ready.
// The browser receives a synthetic disposable sheet. All writes are blocked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const repo = process.cwd();
const origin = 'http://localhost:8798';
const { newTable: tableId } = JSON.parse(
  await readFile(repo + '/outputs/nightshift/2026-09-07/csv-ui.json', 'utf8'),
);
assert.ok(tableId);
const workspaceUrl = origin + '/api/workspace?workspaceId=' + tableId;
async function readRealWorkspace() {
  const response = await fetch(workspaceUrl);
  assert.equal(response.status, 200);
  return (await response.json()).workspace;
}
const before = await readRealWorkspace();
assert.match(before.name, /^Night shift QA/);
const savedViewName = 'Alpha companies';
const fixture = {
  ...structuredClone(before),
  columns: [
    { id: 'company', title: 'Company', kind: 'text', width: 220 },
    { id: 'domain', title: 'Domain', kind: 'text', width: 190 },
    {
      id: 'company_label', title: 'Company label', kind: 'formula',
      recipe: 'custom-formula', expression: '{{company}}', width: 230,
    },
    { id: 'status', title: 'Run status', kind: 'status', width: 150 },
  ],
  rows: [
    ['alpha-one', 'Alpha One', 'Ready'],
    ['alpha-two', 'Alpha Two', 'Review'],
    ['gamma-three', 'Gamma Three', 'Imported'],
    ['beta-four', 'Beta Four', 'Ready'],
  ].map(([id, company, status]) => ({
    id,
    values: { company, domain: id + '.example.test', company_label: company, status },
  })),
  savedViews: [{
    id: 'qa-alpha-companies', name: savedViewName,
    columnId: 'company', operator: 'contains', value: 'Alpha', createdAt: 1,
  }],
  source: undefined,
  schedule: undefined,
  workbookPlan: undefined,
  tableTransfers: undefined,
};
const writes = [];
const externalRequests = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12_000);
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  if (!['GET', 'HEAD'].includes(method)) {
    writes.push({ method, path: url.pathname });
    return route.fulfill({ status: 409, json: { error: 'Row-filter UI test blocks writes and execution.' } });
  }
  if (url.origin === origin && method === 'GET') {
    if (url.pathname === '/api/workspace' && url.searchParams.get('workspaceId') === tableId)
      return route.fulfill({ json: { workspace: fixture } });
    if (url.pathname === '/api/jobs') return route.fulfill({ json: { jobs: [] } });
    if (url.pathname === '/api/runs') return route.fulfill({ json: { runs: [] } });
    if (url.pathname === '/api/providers/research') return route.fulfill({ json: {
      provider: 'parallel', configured: false, ready: false, label: 'Parallel',
      model: 'QA synthetic status', alternatives: [],
      capabilities: { webResearch: true, citations: true, maximumActionsPerRun: 10 },
    } });
  }
  if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
    externalRequests.push({ method, path: url.origin + url.pathname });
    return route.abort();
  }
  return route.continue();
});

const search = () => page.getByLabel('Search rows', { exact: true });
const menu = () => page.getByRole('menu').filter({ has: page.getByRole('menuitemradio', { name: 'All statuses', exact: true }) });
async function openFilterMenu() {
  await page.getByRole('button', { name: 'Filter rows', exact: true }).click();
  await menu().waitFor();
  return menu();
}
async function chooseFilter(name) {
  const popup = await openFilterMenu();
  await popup.getByRole('menuitemradio', { name, exact: true }).click();
  await dismissFilterPopup(popup);
}
async function dismissFilterPopup(popup) {
  // The final single-choice menu must dismiss itself after choosing a filter.
  await popup.waitFor({ state: 'hidden', timeout: 2_000 });
}
async function assertRows(count, selected = false) {
  const label = count === 4 ? '4 rows' : `${count} of 4 rows`;
  await page.waitForFunction((expected) =>
    document.querySelector('.view-row-count')?.textContent.replace(/\s+/g, ' ').trim() === expected,
  label);
  if (selected) {
    await page.getByRole('button', { name: 'Run 1 selected row', exact: true }).waitFor();
  } else {
    const filtered = count !== 4 || Boolean(await search().inputValue());
    await page.getByRole('button', {
      name: `Run ${count}${filtered ? ' visible' : ''} ${count === 1 ? 'row' : 'rows'}`,
      exact: true,
    }).waitFor();
  }
}
async function clearFilters() {
  await page.locator('.sheet-view-controls').getByRole('button', { name: 'Clear filters', exact: true }).click();
  await assertRows(4);
  assert.equal(await search().inputValue(), '');
}

try {
  await page.goto(origin + '/?table=' + tableId);
  await assertRows(4);
  let popup = await openFilterMenu();
  assert.equal(await popup.getByRole('menuitemradio', { name: 'All statuses', exact: true }).getAttribute('aria-checked'), 'true');
  for (const name of ['Ready', 'Review', 'Imported', savedViewName])
    await popup.getByRole('menuitemradio', { name, exact: true }).waitFor();
  await page.screenshot({ path: 'outputs/nightshift/2026-09-07/row-filters-desktop.png', animations: 'disabled' });
  await popup.getByRole('menuitemradio', { name: 'Imported', exact: true }).click();
  await dismissFilterPopup(popup);
  await assertRows(1);
  popup = await openFilterMenu();
  assert.equal(await popup.getByRole('menuitemradio', { name: 'Imported', exact: true }).getAttribute('aria-checked'), 'true');
  await page.keyboard.press('Escape');

  await chooseFilter('Ready');
  await assertRows(2);
  await search().fill('Alpha');
  await assertRows(1);
  await chooseFilter(savedViewName);
  await assertRows(2);
  assert.equal(await search().inputValue(), 'Alpha', 'Saved filters must preserve current search text.');
  popup = await openFilterMenu();
  assert.equal(await popup.getByRole('menuitemradio', { name: savedViewName, exact: true }).getAttribute('aria-checked'), 'true');
  assert.equal(await popup.getByRole('menuitemradio', { name: 'Ready', exact: true }).getAttribute('aria-checked'), 'false');
  await popup.getByRole('menuitemradio', { name: 'All statuses', exact: true }).click();
  await dismissFilterPopup(popup);
  await assertRows(2);
  assert.equal(await search().inputValue(), 'Alpha', 'All statuses must preserve the separate search control.');
  popup = await openFilterMenu();
  assert.equal(await popup.getByRole('menuitemradio', { name: 'All statuses', exact: true }).getAttribute('aria-checked'), 'true');
  assert.equal(await popup.getByRole('menuitemradio', { name: savedViewName, exact: true }).getAttribute('aria-checked'), 'false');
  await page.keyboard.press('Escape');
  await clearFilters();

  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible' });
  const grid = await canvas.boundingBox();
  assert.ok(grid);
  await page.mouse.click(grid.x + 25, grid.y + 65); // First row's checkbox.
  await page.locator('.selection-chip').filter({ hasText: /^1 selected$/ }).waitFor();
  await assertRows(4, true);
  await chooseFilter('Ready'); // Alpha One remains visible; selection must still clear.
  await assertRows(2);
  assert.equal(await page.locator('.selection-chip').count(), 0, 'Choosing a filter must clear checked-row execution scope.');

  popup = await openFilterMenu();
  await popup.getByRole('menuitem', { name: 'Create a saved filter…', exact: true }).click();
  const builder = page.getByRole('dialog', { name: 'Save a filtered view', exact: true });
  await builder.waitFor();
  await builder.getByLabel('View name', { exact: true }).waitFor();
  await builder.getByRole('button', { name: 'Cancel', exact: true }).click();
  await builder.waitFor({ state: 'hidden' });
  await assertRows(2);
  await clearFilters();

  await page.setViewportSize({ width: 390, height: 844 });
  const hideNavigation = page.getByRole('button', { name: 'Hide navigation', exact: true });
  if (await hideNavigation.isVisible()) await hideNavigation.click();
  await page.getByRole('button', { name: 'Filter rows', exact: true }).scrollIntoViewIfNeeded();
  popup = await openFilterMenu();
  await popup.getByRole('menuitem', { name: 'Create a saved filter…', exact: true }).waitFor();
  const bounds = await popup.boundingBox();
  assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= 391, 'Filter menu must fit a 390px phone viewport.');
  assert.ok(bounds.y >= -1 && bounds.y + bounds.height <= 845, 'Filter menu must stay within phone height.');
  const overflow = await popup.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1, 'Filter labels must not overflow the mobile popup.');
  await page.screenshot({ path: 'outputs/nightshift/2026-09-07/row-filters-mobile.png', animations: 'disabled' });
  await popup.getByRole('menuitemradio', { name: 'Imported', exact: true }).click();
  await dismissFilterPopup(popup);
  await assertRows(1);
  await clearFilters();
  await delay(800); // Detect any unintended 500ms autosave after view changes.

  assert.deepEqual(writes, [], 'Changing views and cancelling the builder must send no mutations.');
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(await readRealWorkspace(), before, 'The actual disposable fixture must remain unchanged.');
  console.log(JSON.stringify({
    passed: true, fixture: tableId, savedDataWrites: 0,
    checks: [
      'Explicit menu contains standard statuses, imported row status and saved views',
      'Imported selects one row; Ready selects two',
      'Search combines with status filtering',
      'Saved views clear status while preserving search',
      'All statuses clears saved view while preserving search; Clear filters resets both',
      'Filter choice clears existing checked-row execution scope',
      'Create a saved filter opens the existing builder and Cancel does not save',
      '390px filter menu fits and selects Imported correctly',
      'No provider calls, page errors or real data writes',
    ], pageErrors,
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: 'outputs/nightshift/2026-09-07/row-filters-failure.png', animations: 'disabled' });
  throw error;
} finally {
  await browser.close();
}
