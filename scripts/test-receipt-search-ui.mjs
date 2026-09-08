// Synthetic receipt search/status/pagination QA. No saved data writes or providers.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const repo = process.cwd();
const origin = 'http://localhost:8798';
const { newTable: tableId } = JSON.parse(await readFile(repo + '/outputs/nightshift/2026-09-07/csv-ui.json', 'utf8'));
const workspaceUrl = origin + '/api/workspace?workspaceId=' + tableId;
async function readRealWorkspace() {
  const response = await fetch(workspaceUrl);
  assert.equal(response.status, 200);
  return (await response.json()).workspace;
}
const before = await readRealWorkspace();
assert.match(before.name, /^Night shift QA/);
const now = Date.now();
const run = {
  id: 'large', workspaceId: tableId, status: 'completed',
  startedAt: now - 1000, finishedAt: now, rowCount: 205, actionCount: 205,
  passedCount: 185, reviewCount: 20, skippedCount: 0, externalWrites: 0, provider: 'local',
  receipts: Array.from({ length: 205 }, (_, index) => {
    const row = index + 1;
    const review = row % 10 === 0;
    return {
      id: `large-${row}`, rowId: `large-row-${row}`, rowLabel: `large row ${row}`,
      columnId: 'qa_formula', action: 'QA formula', status: review ? 'review' : 'passed',
      durationMs: 1, before: '', after: review ? '' : `Result ${row}`,
      error: review ? 'Mailbox unavailable' : undefined,
      provider: 'local', evidence: [`Synthetic evidence ${row}`],
    };
  }),
};
assert.equal(run.receipts.filter((receipt) => receipt.status === 'review').length, run.reviewCount);
const writes = [], externalRequests = [], pageErrors = [];
let mockedHistoryReads = 0;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12_000);
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.route('**/*', async (route) => {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  if (!['GET', 'HEAD'].includes(method)) {
    writes.push({ method, path: url.pathname });
    return route.fulfill({ status: 409, json: { error: 'Receipt QA blocks writes and execution.' } });
  }
  if (url.origin === origin && method === 'GET') {
    if (url.pathname === '/api/workspace' && url.searchParams.get('workspaceId') === tableId)
      return route.fulfill({ json: { workspace: before } });
    if (url.pathname === '/api/runs') {
      assert.equal(url.searchParams.get('workspaceId'), tableId);
      mockedHistoryReads++;
      return route.fulfill({ json: { runs: [run] } });
    }
    if (url.pathname === '/api/jobs') return route.fulfill({ json: { jobs: [] } });
    if (url.pathname === '/api/providers/research') return route.fulfill({ json: {
      provider: 'parallel', configured: false, label: 'Parallel', model: 'Synthetic',
      alternatives: [], capabilities: { webResearch: true, citations: true, maximumActionsPerRun: 10 },
    } });
  }
  if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
    externalRequests.push({ method, path: url.origin + url.pathname });
    return route.abort();
  }
  return route.continue();
});
const dialog = () => page.getByRole('dialog', { name: 'Run receipt', exact: true });
const query = () => dialog().getByLabel('Search run receipt', { exact: true });
const status = () => dialog().getByLabel('Receipt status', { exact: true });
const previous = () => dialog().getByRole('button', { name: 'Previous page', exact: true });
const next = () => dialog().getByRole('button', { name: 'Next page', exact: true });
const entries = () => dialog().locator('.receipt-log > div');
const rowNumbers = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => start + index);
const reviewRows = Array.from({ length: 20 }, (_, index) => (index + 1) * 10);
async function openRun() {
  await page.getByRole('button', { name: /^Run history/ }).click();
  const history = page.getByRole('dialog', { name: 'Run history', exact: true });
  await history.waitFor();
  await history.locator('.run-history-list button').filter({ hasText: '205 rows · 205 actions' }).click();
  await dialog().waitFor();
}
async function assertTotal() {
  const actions = dialog().locator('.receipt-summary > div').filter({ has: page.getByText('Actions', { exact: true }) });
  assert.equal((await actions.locator('strong').textContent()).trim(), '205', 'Summary action count must describe the full run.');
}
async function assertEntries(numbers, footer, canPrevious = false, canNext = false) {
  await dialog().locator('.receipt-pagination').getByText(footer, { exact: true }).waitFor();
  assert.equal(await entries().count(), numbers.length);
  assert.deepEqual((await entries().locator(':scope > div > strong').allTextContents()).map((text) => text.trim()), numbers.map((number) => `large row ${number} · QA formula`));
  assert.equal(await previous().isEnabled(), canPrevious);
  assert.equal(await next().isEnabled(), canNext);
  await assertTotal();
}
async function clearFilters() {
  await dialog().getByRole('button', { name: 'Clear receipt filters', exact: true }).click();
  assert.equal(await query().inputValue(), '');
  assert.equal(await status().inputValue(), 'all');
  await assertEntries(rowNumbers(1, 100), '1–100 of 205 actions', false, true);
}
try {
  await page.goto(origin + '/?table=' + tableId);
  await openRun();
  await assertEntries(rowNumbers(1, 100), '1–100 of 205 actions', false, true);
  await next().click();
  await assertEntries(rowNumbers(101, 200), '101–200 of 205 actions', true, true);
  await next().click();
  await assertEntries(rowNumbers(201, 205), '201–205 of 205 actions', true, false);
  await query().fill('large row 205');
  await assertEntries([205], '1–1 of 1 actions · 205 total');
  await clearFilters();

  await status().selectOption('review');
  await assertEntries(reviewRows, '1–20 of 20 actions · 205 total');
  assert.equal(await dialog().locator('.receipt-error').count(), 20);
  await status().selectOption('all');
  await query().fill('Mailbox unavailable');
  await assertEntries(reviewRows, '1–20 of 20 actions · 205 total');
  await page.screenshot({ path: 'outputs/nightshift/2026-09-07/receipt-search-desktop.png', animations: 'disabled' });
  await status().selectOption('passed');
  await dialog().getByText('No matching actions. Try another search or clear the filters.', { exact: true }).waitFor();
  await assertEntries([], '0 matching actions');
  await clearFilters();

  await status().selectOption('passed');
  const passedRows = rowNumbers(1, 205).filter((number) => number % 10 !== 0);
  await assertEntries(passedRows.slice(0, 100), '1–100 of 185 actions · 205 total', false, true);
  await next().click();
  await assertEntries(passedRows.slice(100), '101–185 of 185 actions · 205 total', true, false);
  await clearFilters();
  await status().selectOption('review');
  await query().fill('Mailbox unavailable');
  await assertEntries(reviewRows, '1–20 of 20 actions · 205 total');
  await dialog().getByRole('button', { name: 'Close', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  await openRun();
  assert.equal(await query().inputValue(), '');
  assert.equal(await status().inputValue(), 'all');
  await assertEntries(rowNumbers(1, 100), '1–100 of 205 actions', false, true);

  await page.setViewportSize({ width: 390, height: 844 });
  await status().selectOption('review');
  await query().fill('Mailbox unavailable');
  await assertEntries(reviewRows, '1–20 of 20 actions · 205 total');
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
  for (const [name, locator] of [
    ['receipt dialog', dialog()], ['search field', query()], ['status filter', status()],
    ['clear filters', dialog().getByRole('button', { name: 'Clear receipt filters', exact: true })],
    ['pagination', dialog().locator('.receipt-pagination')], ['previous page', previous()], ['next page', next()],
  ]) {
    const box = await locator.boundingBox();
    assert.ok(box, `${name} is visible on mobile.`);
    assert.ok(box.x >= -1 && box.x + box.width <= 391, `${name} fits the 390px mobile width.`);
    assert.ok(box.y >= -1 && box.y + box.height <= 845, `${name} fits the mobile height: ${JSON.stringify(box)}.`);
  }
  const overflow = await dialog().evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1, 'Receipt controls must not overflow horizontally.');
  await page.screenshot({ path: 'outputs/nightshift/2026-09-07/receipt-search-mobile.png', animations: 'disabled' });
  await clearFilters();
  assert.ok(mockedHistoryReads > 0);
  assert.deepEqual(writes, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(await readRealWorkspace(), before, 'Actual saved data must remain unchanged.');
  console.log(JSON.stringify({ passed: true, tableId, mockedHistoryReads, writes, pageErrors, checks: [
    '205 actions paginate as 100/100/5 with correct full-run summary',
    'Searching row 205 from page 3 resets to the matching first page',
    'Needs-review filter returns exactly 20 review actions',
    'Error search returns review actions without a status filter',
    'Contradictory status/search shows no matches with both page controls disabled',
    'Passed filter paginates 185 actions without review rows',
    'Clear restores all 205 actions on page 1; reopening resets filters',
    '390px search/status/clear/pagination controls fit',
    'No provider execution or saved-data writes',
  ] }, null, 2));
} catch (error) {
  await page.screenshot({ path: 'outputs/nightshift/2026-09-07/receipt-search-failure.png', animations: 'disabled' });
  throw error;
} finally {
  await browser.close();
}
