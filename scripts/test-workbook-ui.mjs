// Isolated browser regression checks. Uses only a clearly named disposable sheet.
// Run against the existing local app: node scripts/test-workbook-ui.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const origin = process.env.POMADE_UI_ORIGIN ?? 'http://localhost:8798';
const out = 'outputs/nightshift/2026-09-07';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const api = async (path) => {
  const response = await page.request.get(origin + path);
  assert.equal(response.status(), 200);
  return response.json();
};
const saved = async () => {
  const response = await page.waitForResponse(
    (r) =>
      r.url().includes('/api/workspace?') && r.request().method() === 'PUT',
  );
  assert.equal(response.status(), 200);
};
const close = () =>
  page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
const openCatalog = async () => {
  if (
    !(await page
      .getByRole('button', { name: 'Provider catalog', exact: true })
      .isVisible())
  )
    await page.getByRole('button', { name: 'Enrich', exact: true }).click();
  await page
    .getByRole('button', { name: 'Provider catalog', exact: true })
    .click();
};
try {
  let fixture;
  try {
    fixture = JSON.parse(await readFile(out + '/ui-fixture.json', 'utf8'));
  } catch {}
  await page.goto(
    origin + (fixture?.tableId ? '/?table=' + fixture.tableId : '/'),
  );
  if (!fixture) {
    await page.getByRole('button', { name: 'New table', exact: true }).click();
    await page
      .getByLabel('Table name', { exact: true })
      .fill('Night shift QA — disposable');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Create table', exact: true })
      .click();
    await page.waitForURL(/table=/);
    fixture = { tableId: new URL(page.url()).searchParams.get('table') };
    await writeFile(out + '/ui-fixture.json', JSON.stringify(fixture));
  }
  const workspacePath = '/api/workspace?workspaceId=' + fixture.tableId;
  let initial = await api(workspacePath);
  initial = initial.workspace ?? initial;
  assert.match(initial.name, /^Night shift QA/, 'Never mutate a user sheet');
  await page.getByRole('button', { name: /^Columns / }).click();
  await page.getByLabel('Search columns', { exact: true }).fill('Person');
  await Promise.all([
    saved(),
    page.getByRole('checkbox', { name: 'Show Person', exact: true }).uncheck(),
  ]);
  await close();
  await page.reload();
  await page.getByRole('button', { name: /^Columns / }).click();
  assert.equal(
    await page
      .getByRole('checkbox', { name: 'Show Person', exact: true })
      .isChecked(),
    false,
  );
  await Promise.all([
    saved(),
    page.getByRole('button', { name: 'Show all', exact: true }).click(),
  ]);
  await page
    .getByLabel('Search columns', { exact: true })
    .fill('Company domain');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Company domain/ })
    .click();
  await openCatalog();
  await page
    .getByLabel('Search providers and actions')
    .fill('Apollo verified email');
  const lookup = page.getByRole('button', {
    name: /Apollo · find verified email/,
  });
  await lookup.click();
  assert.equal(
    await page.getByLabel('Provider preset 1', { exact: true }).inputValue(),
    'apollo',
  );
  await Promise.all([
    saved(),
    page
      .getByRole('button', { name: 'Add provider lookup', exact: true })
      .click(),
  ]);
  await openCatalog();
  await page
    .getByLabel('Search providers and actions')
    .fill('Apollo verified email');
  await lookup.click();
  await Promise.all([
    saved(),
    page
      .getByRole('button', { name: 'Add provider lookup', exact: true })
      .click(),
  ]);
  let after = await api(workspacePath);
  after = after.workspace ?? after;
  assert.equal(after.columns.length, initial.columns.length + 6);
  assert.equal(
    new Set(after.columns.map((c) => c.id)).size,
    after.columns.length,
  );
  const lastLookups = after.columns
    .filter((c) => c.recipe === 'http-waterfall')
    .slice(-2);
  assert.notEqual(lastLookups[0].title, lastLookups[1].title);
  await openCatalog();
  await page.getByLabel('Search providers and actions').fill('Dropcontact');
  await page.getByRole('button', { name: /Dropcontact · find named/ }).click();
  await page
    .getByLabel('Verifier for provider 1', { exact: true })
    .selectOption('hunter-verify');
  await page
    .getByLabel('Provider preset 1', { exact: true })
    .selectOption('apollo-mobile');
  assert.equal(
    await page
      .getByLabel('Verifier for provider 1', { exact: true })
      .inputValue(),
    '',
  );
  assert.equal(await page.getByLabel('Accept the first').inputValue(), 'phone');
  await close();
  await page.route('**/api/providers/http', (route) =>
    route.fulfill({ status: 503, json: { error: 'Synthetic offline check' } }),
  );
  await openCatalog();
  await page
    .getByLabel('Search providers and actions')
    .fill('Apollo verified email');
  await lookup.click();
  await page
    .getByText('The connection check could not finish.', { exact: false })
    .waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Add provider lookup', exact: true })
      .isEnabled(),
    true,
  );
  await close();
  await page.unroute('**/api/providers/http');
  await openCatalog();
  await page.getByLabel('Search providers and actions').fill('Apollo');
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  const activeButton = page.getByRole('button', {
    name: 'All providers',
    exact: true,
  });
  assert.equal(
    await activeButton.evaluate((el) => getComputedStyle(el).color),
    'rgb(255, 255, 255)',
  );
  await page.screenshot({
    path: out + '/catalog-desktop-verified.png',
    animations: 'disabled',
  });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running'),
    );
    const rect = await page.getByRole('dialog').boundingBox();
    assert.ok(
      rect.x >= 0 && rect.x + rect.width <= width + 1,
      'Dialog must fit viewport ' + width,
    );
    assert.ok(
      rect.y >= 0 && rect.y + rect.height <= 845,
      'Dialog must fit viewport height',
    );
    await page.screenshot({
      path: out + `/catalog-${width}-verified.png`,
      animations: 'disabled',
    });
  }
  await close();
  assert.deepEqual(errors, []);
  await writeFile(
    out + '/workbook-ui.json',
    JSON.stringify(
      {
        passed: true,
        tableId: fixture.tableId,
        checks: [
          'column visibility persists',
          'show all and jump',
          'repeat provider action',
          'switch email verifier to phone',
          'save preset when connection check fails',
          'primary button contrast',
          '390/768/1440 responsive catalog',
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Workbook UI: 7 checks passed; no page errors; only the disposable QA sheet changed.',
  );
} finally {
  await browser.close();
}
