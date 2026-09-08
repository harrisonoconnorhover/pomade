// Read-only lookup loading and table-discovery recovery on disposable QA data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const origin = 'http://localhost:8798';
const out = 'outputs/nightshift/2026-09-07';
const { tableId } = JSON.parse(
  await readFile(out + '/crm-live-fixture.json', 'utf8'),
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [],
  writes = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()))
    writes.push(r.url());
});
let intercept = false,
  release;
let gate = new Promise((resolve) => {
  release = resolve;
});
await page.route(origin + '/api/tables', async (route) => {
  if (!intercept) return route.continue();
  await gate;
  return route.fulfill({
    status: 503,
    json: { error: 'QA table discovery outage' },
  });
});
const open = async () => {
  await page
    .getByRole('button', {
      name: 'Add a column: data, enrichment, research, or formula',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Lookup another table', exact: true })
    .click();
};
try {
  await page.goto(origin + '/?table=' + tableId);
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  const hideNavigation = page.getByRole('button', {
    name: 'Hide navigation',
    exact: true,
  });
  if (await hideNavigation.count()) await hideNavigation.click();
  intercept = true;
  await open();
  await page.getByText('Loading source tables…', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Source table', { exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole('option', { name: 'Create another table first', exact: true })
      .count(),
    0,
  );
  release();
  await page
    .getByRole('alert')
    .filter({ hasText: 'Source tables could not be loaded.' })
    .waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Add lookup column', exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: out + '/lookup-tables-error-mobile.png',
    animations: 'disabled',
  });
  intercept = false;
  await page.getByRole('button', { name: 'Retry tables', exact: true }).click();
  await page
    .getByRole('button', { name: 'Reload source', exact: true })
    .waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.equal(
    await page.getByLabel('Source table', { exact: true }).isEnabled(),
    true,
  );
  assert.equal(
    await page
      .locator('.lookup-fields')
      .first()
      .evaluate(
        (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length,
      ),
    1,
  );
  assert.equal(
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .evaluate((e) => getComputedStyle(e).position),
    'absolute',
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'Add lookup column', exact: true })
      .evaluate((e) => getComputedStyle(e).position),
    'sticky',
  );
  await page.screenshot({
    path: out + '/lookup-tables-recovered-mobile.png',
    animations: 'disabled',
  });
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    checks: [
      'Loading does not claim there are no source tables',
      'Loading disables source selection',
      'Discovery errors block adding stale lookups',
      'Retry tables restores the source without closing',
      'Recovered source fields fit a 390px viewport',
    ],
    savedDataWrites: 0,
    pageErrors: errors,
  };
  await writeFile(
    out + '/lookup-loading-ui.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  release();
  await browser.close();
}
