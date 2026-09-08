// Read-only browser regression using a synthetic 120-row view of a disposable sheet.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const origin = 'http://localhost:8798';
const out = 'outputs/nightshift/2026-09-07';
const { newTable: tableId } = JSON.parse(
  await readFile(out + '/csv-ui.json', 'utf8'),
);
const before = (
  await (await fetch(origin + '/api/workspace?workspaceId=' + tableId)).json()
).workspace;
assert.match(before.name, /^Night shift QA/);
const fixture = {
  ...before,
  rows: Array.from({ length: 120 }, (_, i) => ({
    id: 'qa-nav-' + (i + 1),
    values: {
      ...before.rows[0].values,
      company: 'Navigation QA ' + String(i + 1).padStart(3, '0'),
    },
  })),
};
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  writes = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()))
    writes.push(new URL(r.url()).pathname);
});
await page.route(origin + '/api/workspace?*', (route) =>
  route.request().method() === 'GET'
    ? route.fulfill({ json: { workspace: fixture } })
    : route.abort(),
);
const inspector = page.getByRole('complementary', { name: 'Record details' });
const heading = (n) =>
  inspector.getByRole('heading', {
    name: 'Navigation QA ' + String(n).padStart(3, '0'),
    exact: true,
  });
const grid = async () => {
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  return page.locator('canvas').first().boundingBox();
};
try {
  await page.goto(origin + '/?table=' + tableId);
  await grid();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  let box = await grid();
  await page.mouse.click(box.x + 100, box.y + 65);
  await page.keyboard.press('ArrowDown');
  await heading(2).waitFor();
  await page.keyboard.press('ArrowDown');
  await heading(3).waitFor();
  await page.keyboard.press('ArrowUp');
  await heading(2).waitFor();
  box = await grid();
  await page.mouse.click(box.x + 25, box.y + 157);
  await heading(3).waitFor();
  await page.goto(origin + '/?table=' + tableId + '&row=qa-nav-100');
  await grid();
  await heading(100).waitFor();
  await page.waitForFunction(
    () => document.querySelector('.dvn-scroller')?.scrollTop > 3000,
  );
  await page.keyboard.press('ArrowDown');
  await heading(101).waitFor();
  await page.screenshot({
    path: out + '/linked-row-desktop.png',
    animations: 'disabled',
  });
  await page
    .getByRole('button', { name: 'Close record details', exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/?table=' + tableId + '&row=qa-nav-110');
  await grid();
  await heading(110).waitFor();
  await page
    .getByRole('button', { name: 'Close record details', exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector('.dvn-scroller')?.scrollTop > 3000,
  );
  await page.screenshot({
    path: out + '/linked-row-mobile.png',
    animations: 'disabled',
  });
  await page.goto(origin + '/?table=' + tableId + '&row=missing-row');
  await page
    .getByText('The linked source row no longer exists.', { exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(
    (
      await (
        await fetch(origin + '/api/workspace?workspaceId=' + tableId)
      ).json()
    ).workspace,
    before,
  );
  const result = {
    passed: true,
    checks: [
      'Arrow-key selection updates record details',
      'Checkbox selection still chooses its record',
      'Deep links scroll to and select an offscreen row',
      'Arrow keys continue from the linked row',
      'Phone source links reveal the intended row',
      'Missing rows have an explicit notice',
    ],
    savedDataWrites: 0,
    pageErrors: errors,
  };
  await writeFile(
    out + '/row-navigation-ui.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: out + '/row-navigation-failure.png' });
  throw error;
} finally {
  await browser.close();
}
