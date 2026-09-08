import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const origin = 'http://localhost:8798',
  out = 'outputs/nightshift/2026-09-07';
const { newTable: tableId } = JSON.parse(
  await readFile(out + '/csv-ui.json', 'utf8'),
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const requests = [],
  errors = [];
page.on('request', (r) => requests.push(new URL(r.url()).pathname));
page.on('pageerror', (e) => errors.push(e.message));
const close = () =>
  page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
try {
  await page.goto(origin + '/?table=' + tableId);
  await page.getByRole('button', { name: 'More', exact: true }).waitFor();
  assert.ok(!requests.some((path) => /csv-(import|export)-dialog/.test(path)));
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Export CSV', exact: true }).click();
  await page.getByRole('dialog', { name: 'Export CSV', exact: true }).waitFor();
  assert.ok(requests.some((path) => path.includes('csv-export-dialog')));
  await close();
  await page.getByRole('button', { name: 'Add data', exact: true }).click();
  await page.getByRole('button', { name: 'Load data', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'Lazy QA.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Company,Email\nExample,qa@example.test'),
  });
  await page.getByRole('dialog', { name: 'Preview your CSV' }).waitFor();
  await page.getByText('1 row · 2 columns', { exact: true }).waitFor();
  assert.ok(requests.some((path) => path.includes('csv-import-dialog')));
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page
    .getByRole('button', { name: 'Build from a prompt', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Use DemandDrive example', exact: true })
    .click();
  assert.match(
    await page.getByLabel('What would you like to build?').inputValue(),
    /HealthEdge.*Clearwater Security/s,
  );
  await close();
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    checks: [
      'CSV chunks not requested while opening sheet',
      'export chunk loads on demand',
      'import chunk loads and previews on demand',
      'DemandDrive example still fills prompt',
    ],
    pageErrors: errors,
  };
  await writeFile(out + '/lazy-tools-ui.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
