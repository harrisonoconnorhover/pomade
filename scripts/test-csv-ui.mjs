// Browser coverage for preview/cancel, append mapping and new-sheet CSV import.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const origin = 'http://localhost:8798';
const out = 'outputs/nightshift/2026-09-07';
const fixture = JSON.parse(await readFile(out + '/ui-fixture.json', 'utf8'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
async function workspace(id = fixture.tableId) {
  const r = await page.request.get(origin + '/api/workspace?workspaceId=' + id);
  assert.equal(r.status(), 200);
  return (await r.json()).workspace;
}
async function chooseCsv(text, name = 'Night shift QA import.csv') {
  if (
    !(await page
      .getByRole('button', { name: 'Load data', exact: true })
      .isVisible())
  )
    await page.getByRole('button', { name: 'Add data', exact: true }).click();
  await page.getByRole('button', { name: 'Load data', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file', exact: true }).click();
  await (
    await chooser
  ).setFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
  await page.getByRole('dialog', { name: 'Preview your CSV' }).waitFor();
}
try {
  await page.goto(origin + '/?table=' + fixture.tableId);
  const before = await workspace();
  assert.match(before.name, /^Night shift QA/);
  const malformed = 'Company,Email\nAcme,one@test,extra';
  await chooseCsv(malformed);
  await page.getByRole('alert').filter({ hasText: 'Row 2' }).waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Create sheet from CSV', exact: true })
      .isEnabled(),
    false,
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual((await workspace()).columns, before.columns);
  assert.deepEqual((await workspace()).rows, before.rows);
  const csv =
    'Company,Email,Status,Notes\nNightshift Example,qa@example.test,Customer,"First, second"\nNightshift Second,second@example.test,Trial,More';
  await chooseCsv(csv);
  await page.getByText('2 rows · 4 columns', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('radio', { name: /Create a new sheet/ }).isChecked(),
    true,
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual((await workspace()).rows, before.rows);
  await chooseCsv(csv);
  await page.getByRole('radio', { name: /Add rows to this sheet/ }).check();
  await page.getByLabel('Map Notes', { exact: true }).selectOption('@skip');
  assert.equal(
    await page.getByLabel('Map Company', { exact: true }).inputValue(),
    'company',
  );
  await page.screenshot({
    path: out + '/csv-append-desktop.png',
    animations: 'disabled',
  });
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes('/api/workspace?') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Add 2 rows', exact: true }).click();
  assert.equal((await saved).status(), 200);
  const appended = await workspace();
  assert.deepEqual(appended.rows.slice(0, before.rows.length), before.rows);
  assert.equal(appended.rows.length, before.rows.length + 2);
  assert.deepEqual(
    appended.columns.filter((c) => c.recipe),
    before.columns.filter((c) => c.recipe),
  );
  assert.equal(appended.rows.at(-2).values.csv_status, 'Customer');
  assert.equal(appended.rows.at(-1).values.status, 'Imported');
  assert.ok(!appended.columns.some((c) => c.id === 'notes'));
  await chooseCsv(csv, 'Night shift QA new sheet.csv');
  await page.getByText('2 rows · 4 columns', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  const rect = await page.getByRole('dialog').boundingBox();
  assert.ok(rect.x >= 0 && rect.x + rect.width <= 391);
  await page.screenshot({
    path: out + '/csv-new-mobile.png',
    animations: 'disabled',
  });
  await page
    .getByRole('button', { name: 'Create sheet from CSV', exact: true })
    .click();
  await page.waitForURL(
    (url) => url.searchParams.get('table') !== fixture.tableId,
  );
  const newId = new URL(page.url()).searchParams.get('table');
  const created = await workspace(newId);
  assert.equal(created.rows.length, 2);
  assert.equal(created.rows[0].values.csv_status, 'Customer');
  assert.equal(created.rows[0].values.notes, 'First, second');
  assert.deepEqual((await workspace()).rows, appended.rows);
  await page.reload();
  await page.getByRole('button', { name: /^Columns / }).waitFor();
  assert.deepEqual((await workspace(newId)).rows, created.rows);
  assert.deepEqual(errors, []);
  await writeFile(
    out + '/csv-ui.json',
    JSON.stringify(
      {
        passed: true,
        originalTable: fixture.tableId,
        newTable: newId,
        checks: [
          'malformed input blocks import',
          'preview/cancel preserves sheet',
          'new-sheet default',
          'append mapping and skip',
          'recipe preservation',
          'CSV Status retained',
          'mobile preview fits',
          'new sheet persists after reload',
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'CSV UI: 8 checks passed; original data preserved; two disposable QA sheets used.',
  );
} finally {
  await browser.close();
}
