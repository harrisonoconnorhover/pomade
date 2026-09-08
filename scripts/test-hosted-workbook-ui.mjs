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
const workspaceResponse = await fetch(
  origin + '/api/workspace?workspaceId=' + encodeURIComponent(table.id),
  { headers },
);
assert.equal(workspaceResponse.status, 200);
const { workspace } = await workspaceResponse.json();
const searchColumn =
  workspace.columns.find((column) => column.kind === 'text') ??
  workspace.columns[0];
assert.ok(searchColumn);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  failedRequests = [],
  writes = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (request) =>
  failedRequests.push({
    path: new URL(request.url()).pathname,
    method: request.method(),
    error: request.failure()?.errorText,
  }),
);
page.on('request', (request) => {
  if (
    new URL(request.url()).origin === origin &&
    new URL(request.url()).pathname.startsWith('/api/') &&
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
  const gridBounds = await page.locator('canvas').first().boundingBox();
  assert.ok(gridBounds);
  await page.mouse.click(gridBounds.x + 100, gridBounds.y + 20, {
    button: 'right',
  });
  await page.getByRole('menuitem', { name: /^Add column/ }).click();
  await page
    .getByRole('dialog')
    .getByText('What’s the next step?', { exact: true })
    .waitFor();
  await close();
  await page.getByRole('button', { name: /^Columns / }).click();
  await page
    .getByLabel('Search columns', { exact: true })
    .fill(searchColumn.title);
  await page
    .getByRole('dialog')
    .getByText(searchColumn.title, { exact: true })
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
  await page
    .getByLabel('Source table', { exact: true })
    .locator('option')
    .filter({ hasText: /^(?!Create another|Loading|Tables unavailable)/ })
    .first()
    .waitFor({ state: 'attached' });
  await page
    .getByRole('button', { name: 'Reload source', exact: true })
    .waitFor();
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
  await page
    .getByRole('button', { name: 'Hide navigation', exact: true })
    .click();
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
  assert.equal(
    await page
      .locator('.grid-add-column-rail')
      .evaluate((e) => Math.round(e.getBoundingClientRect().width)),
    48,
  );
  await page
    .locator('.dvn-scroller')
    .first()
    .evaluate((e) => {
      e.scrollLeft = 450;
    });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.ok(
    await page
      .locator('.dvn-scroller')
      .first()
      .evaluate((e) => e.scrollLeft >= 400),
  );
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/hosted-mobile-scrolled.png',
    animations: 'disabled',
  });

  assert.deepEqual(
    writes,
    [],
    'Smoke test must not change the hosted workbook',
  );
  assert.deepEqual(errors, []);
  // Closing an unfinished connection check deliberately aborts those fetches.
  const unexpectedFailures = failedRequests.filter(
    (request) =>
      !(
        request.method === 'GET' &&
        request.error === 'net::ERR_ABORTED' &&
        [
          '/api/providers/research',
          '/api/providers/research/settings',
          '/api/providers/http',
        ].includes(request.path)
      ),
  );
  assert.deepEqual(unexpectedFailures, []);
  const result = {
    passed: true,
    tableId: table.id,
    checks: [
      'Private workbook loads',
      'Right-click opens the column chooser',
      'Column search opens',
      'CSV export loads on demand',
      'Column rail routes to research',
      'Research draft survives output changes',
      'Lookup uses automatic matching and a single mobile field column',
      '390px viewport has no page overflow',
      'Phone grid keeps a compact add control and scrolls across data columns',
    ],
    savedDataWrites: writes.length,
    pageErrors: errors,
  };
  await writeFile(
    'outputs/nightshift/2026-09-07/hosted-ui.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/hosted-failure.png',
  });
  throw error;
} finally {
  await browser.close();
}
