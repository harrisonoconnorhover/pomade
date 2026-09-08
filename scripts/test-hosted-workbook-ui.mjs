// Read-only smoke test of the owner-private deployment. Credentials stay in env.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const origin = process.env.POMADE_HOSTED_URL?.replace(/\/$/, '');
if (
  !origin ||
  !process.env.POMADE_SITES_TOKEN ||
  !process.env.POMADE_OWNER_TOKEN
)
  throw new Error('Owner-private smoke-test environment is required.');
const headers = {
  'OAI-Sites-Authorization': 'Bearer ' + process.env.POMADE_SITES_TOKEN,
  'X-Pomade-Owner-Key': process.env.POMADE_OWNER_TOKEN,
};
const response = await fetch(origin + '/api/tables', { headers });
assert.equal(response.status, 200);
const { tables } = await response.json();
const table =
  tables.find((t) => t.id === 'e202aada-85d2-4752-98a9-af641748d2a0') ??
  tables[0];
assert.ok(table);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  failedRequests = [],
  writes = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (request) =>
  failedRequests.push(new URL(request.url()).pathname),
);
page.on('request', (request) => {
  if (
    new URL(request.url()).origin === origin &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
  )
    writes.push(new URL(request.url()).pathname);
});
// Only send credentials to the selected Pomade origin, never third-party pages.
await page.route(origin + '/**', (route) =>
  route.continue({ headers: { ...route.request().headers(), ...headers } }),
);
const close = async () => {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
};
try {
  await page.goto(origin + '/?table=' + table.id);
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /^Columns / }).click();
  await page.getByLabel('Search columns', { exact: true }).fill('company');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Company/ })
    .first()
    .waitFor();
  await close();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Export CSV', exact: true }).click();
  await page.getByRole('dialog', { name: 'Export CSV', exact: true }).waitFor();
  await close();
  await page
    .getByRole('button', {
      name: 'Add a column: data, enrichment, research, or formula',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: /^AI research Ask a question/ })
    .click();
  await page
    .getByRole('button', { name: /^Parallel · quick web research/ })
    .click();
  const prompt = page.getByLabel('Research prompt', { exact: true });
  await prompt.fill('Read-only QA draft; do not run research.');
  await page.getByRole('button', { name: /^Structured fields/ }).click();
  await page.getByRole('button', { name: /^List into rows/ }).click();
  assert.equal(
    await prompt.inputValue(),
    'Read-only QA draft; do not run research.',
  );
  await close();
  await page
    .getByRole('button', {
      name: 'Add a column: data, enrichment, research, or formula',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Lookup another table', exact: true })
    .click();
  await page.getByLabel('Match rule', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Match rule', { exact: true }).inputValue(),
    'automatic',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const fields = page.getByRole('dialog').locator('.lookup-fields').first();
  assert.equal(
    await fields.evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(' ').length,
    ),
    1,
  );
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/hosted-lookup-mobile.png',
    animations: 'disabled',
  });
  await close();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/hosted-desktop.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/hosted-mobile.png',
    animations: 'disabled',
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(
    writes,
    [],
    'Smoke test must not change the hosted workbook',
  );
  assert.deepEqual(errors, []);
  // Closing an unfinished connection check deliberately aborts those fetches.
  const unexpectedFailures = failedRequests.filter(
    (path) =>
      !['/api/providers/research', '/api/providers/http'].includes(path),
  );
  assert.deepEqual(unexpectedFailures, []);
  const result = {
    passed: true,
    tableId: table.id,
    checks: [
      'Private workbook loads',
      'Column search opens',
      'CSV export loads on demand',
      'Column rail routes to research',
      'Research draft survives output changes',
      'Lookup uses automatic matching and a single mobile field column',
      '390px viewport has no page overflow',
    ],
    savedDataWrites: writes.length,
    pageErrors: errors,
  };
  await writeFile(
    'outputs/nightshift/2026-09-07/hosted-ui.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
