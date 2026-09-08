// Read-only receipt pagination QA. Synthetic history is never persisted.
// Run only after the local pagination build is ready.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = 'http://localhost:8798';
const repo = process.cwd();
const { newTable: tableId } = JSON.parse(
  await readFile(`${repo}/outputs/nightshift/2026-09-07/csv-ui.json`, 'utf8'),
);
assert.ok(tableId, 'The disposable CSV fixture must exist.');

const makeRun = (id, count, finishedAt) => ({
  id,
  workspaceId: tableId,
  status: 'completed',
  startedAt: finishedAt - 1000,
  finishedAt,
  rowCount: count,
  actionCount: count,
  passedCount: count,
  reviewCount: 0,
  skippedCount: 0,
  externalWrites: 0,
  provider: 'local',
  receipts: Array.from({ length: count }, (_, index) => ({
    id: `${id}-${index}`,
    rowId: `${id}-row-${index}`,
    rowLabel: `${id} row ${index + 1}`,
    columnId: 'qa_formula',
    action: 'QA formula',
    status: 'passed',
    durationMs: 1,
    before: '',
    after: `Result ${index + 1}`,
    provider: 'local',
    evidence: [`Synthetic evidence ${index + 1}`],
  })),
});
const now = Date.now();
const runs = [makeRun('large', 205, now), makeRun('small', 3, now - 2000)];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15_000);
const pageErrors = [];
const consoleErrors = [];
const failedResponses = [];
const writes = [];
let mockedHistoryReads = 0;

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('response', (response) => {
  if (new URL(response.url()).origin === origin && response.status() >= 400)
    failedResponses.push({
      path: new URL(response.url()).pathname,
      status: response.status(),
    });
});
page.on('request', (request) => {
  const url = new URL(request.url());
  if (
    url.origin === origin &&
    url.pathname.startsWith('/api/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
  )
    writes.push({ path: url.pathname, method: request.method() });
});

// Fail closed if an unintended write ever occurs while exercising the dialogs.
await page.route(`${origin}/api/**`, (route) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()))
    return route.abort('blockedbyclient');
  return route.continue();
});
await page.route('**/api/runs?*', (route) => {
  if (route.request().method() !== 'GET') return route.fallback();
  const workspaceId = new URL(route.request().url()).searchParams.get(
    'workspaceId',
  );
  assert.equal(workspaceId, tableId);
  mockedHistoryReads++;
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ runs }),
  });
});

const receiptDialog = () =>
  page.getByRole('dialog', { name: 'Run receipt', exact: true });
const previous = () =>
  receiptDialog().getByRole('button', { name: 'Previous page', exact: true });
const next = () =>
  receiptDialog().getByRole('button', { name: 'Next page', exact: true });

async function closeReceipt() {
  await receiptDialog()
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await receiptDialog().waitFor({ state: 'hidden' });
}

async function openRun(count) {
  await page.getByRole('button', { name: /^Run history/ }).click();
  const history = page.getByRole('dialog', {
    name: 'Run history',
    exact: true,
  });
  await history.waitFor();
  await history
    .locator('.run-history-list button')
    .filter({ hasText: `${count} rows · ${count} actions` })
    .click();
  await receiptDialog().waitFor();
}

async function assertPage(id, start, end, total) {
  const footer = receiptDialog().locator('.receipt-pagination');
  await footer
    .getByText(`${start}–${end} of ${total} actions`, { exact: true })
    .waitFor();
  const entries = receiptDialog().locator('.receipt-log > div');
  assert.equal(await entries.count(), end - start + 1);
  const labels = await entries
    .locator(':scope > div > strong')
    .allTextContents();
  assert.deepEqual(
    labels.map((label) => label.trim()),
    Array.from(
      { length: end - start + 1 },
      (_, index) => `${id} row ${start + index} · QA formula`,
    ),
  );
  assert.equal(await previous().isEnabled(), start > 1);
  assert.equal(await next().isEnabled(), end < total);
}

try {
  const fixtureResponse = await page.request.get(
    `${origin}/api/workspace?workspaceId=${encodeURIComponent(tableId)}`,
  );
  assert.equal(fixtureResponse.status(), 200);
  const { workspace } = await fixtureResponse.json();
  assert.match(
    workspace.name,
    /^Night shift QA/,
    'Only use the disposable CSV fixture.',
  );

  await page.goto(`${origin}/?table=${encodeURIComponent(tableId)}`);
  await page.getByRole('button', { name: /^Run history/ }).waitFor();
  await openRun(205);
  await assertPage('large', 1, 100, 205);
  await next().click();
  await assertPage('large', 101, 200, 205);
  await next().click();
  await assertPage('large', 201, 205, 205);
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/receipt-pagination-desktop.png',
    animations: 'disabled',
  });
  await previous().click();
  await assertPage('large', 101, 200, 205);

  await closeReceipt();
  await openRun(205);
  await assertPage('large', 1, 100, 205);
  await next().click();
  await next().click();
  await assertPage('large', 201, 205, 205);
  await closeReceipt();
  await openRun(3);
  await assertPage('small', 1, 3, 3);

  // Open the next run before shrinking so the desktop sidebar entry stays usable.
  await closeReceipt();
  await openRun(205);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  );
  await assertPage('large', 1, 100, 205);
  for (const [name, locator] of [
    ['receipt dialog', receiptDialog()],
    ['pagination', receiptDialog().locator('.receipt-pagination')],
    ['Previous page', previous()],
    ['Next page', next()],
  ]) {
    const box = await locator.boundingBox();
    assert.ok(box, `${name} is visible on mobile.`);
    assert.ok(
      box.x >= -1 && box.x + box.width <= 391,
      `${name} fits mobile width.`,
    );
    assert.ok(
      box.y >= -1 && box.y + box.height <= 845,
      `${name} fits mobile height.`,
    );
  }
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/receipt-pagination-mobile.png',
    animations: 'disabled',
  });
  await next().click();
  await assertPage('large', 101, 200, 205);

  assert.ok(
    mockedHistoryReads > 0,
    'History came from the synthetic response.',
  );
  assert.deepEqual(
    writes,
    [],
    'Receipt navigation must not write data or run providers.',
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedResponses, []);
  console.log(
    JSON.stringify({
      passed: true,
      tableId,
      checks: [
        '205 receipts paginate as 100/100/5',
        'all action labels preserved including action 205',
        'previous/next boundaries',
        'reopening resets the page',
        'opening a smaller run resets the page',
        'mobile dialog and pagination fit',
        'mobile next-page interaction',
        'no writes, provider runs, or page errors',
      ],
      mockedHistoryReads,
      writes,
      pageErrors,
      consoleErrors,
      failedResponses,
      screenshots: [
        'outputs/nightshift/2026-09-07/receipt-pagination-desktop.png',
        'outputs/nightshift/2026-09-07/receipt-pagination-mobile.png',
      ],
    }),
  );
} catch (error) {
  await page
    .screenshot({
      path: 'outputs/nightshift/2026-09-07/receipt-pagination-failure.png',
      animations: 'disabled',
    })
    .catch(() => {});
  console.error(
    JSON.stringify({
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      writes,
      pageErrors,
      consoleErrors,
      failedResponses,
      screenshot:
        'outputs/nightshift/2026-09-07/receipt-pagination-failure.png',
    }),
  );
  throw error;
} finally {
  await browser.close();
}
