// Real Glide paste/clear and filtered-action/export checks on disposable data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import Papa from 'papaparse';
const origin = 'http://localhost:8798',
  out = 'outputs/nightshift/2026-09-07';
const { newTable: tableId } = JSON.parse(
  await readFile(out + '/csv-ui.json', 'utf8'),
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Exercise the browser's paste event without reading or replacing the user's OS clipboard.
await page.addInitScript(() =>
  Object.defineProperty(navigator, 'clipboard', {
    value: {},
    configurable: true,
  }),
);
const getWorkspace = async () => {
  const r = await page.request.get(
    origin + '/api/workspace?workspaceId=' + tableId,
  );
  assert.equal(r.status(), 200);
  return (await r.json()).workspace;
};
const save = () =>
  page.waitForResponse(
    (r) =>
      r.url().includes('/api/workspace?') && r.request().method() === 'PUT',
  );
const close = () =>
  page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
async function paste(text) {
  const canvas = await page.locator('canvas').first().boundingBox();
  await page.mouse.click(canvas.x + 90, canvas.y + 65);
  const saved = save();
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    window.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
  assert.equal((await saved).status(), 200);
}
async function openExport() {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Export CSV', exact: true }).click();
  await page.getByRole('dialog', { name: 'Export CSV', exact: true }).waitFor();
}
async function download(name) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const file = await pending;
  await file.saveAs(out + '/' + name);
  return Papa.parse(await readFile(out + '/' + name, 'utf8'), { header: true })
    .data;
}
try {
  await page.goto(origin + '/?table=' + tableId);
  await page.getByRole('button', { name: 'More', exact: true }).waitFor();
  const before = await getWorkspace();
  assert.match(before.name, /^Night shift QA/);
  assert.equal(before.rows.length, 2);
  await paste(
    'Pasted First\tfirst@example.test\nPasted Second\tsecond@example.test',
  );
  let actual = await getWorkspace();
  assert.deepEqual(
    actual.rows.map((r) => [r.values.company, r.values.email]),
    [
      ['Pasted First', 'first@example.test'],
      ['Pasted Second', 'second@example.test'],
    ],
  );
  const canvas = await page.locator('canvas').first().boundingBox();
  await page.keyboard.press('Escape');
  await page.mouse.move(canvas.x + 90, canvas.y + 65);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 260, canvas.y + 111, { steps: 8 });
  await page.mouse.up();
  await page.screenshot({
    path: out + '/grid-range.png',
    animations: 'disabled',
  });
  const cleared = save();
  await page.keyboard.press('Backspace');
  assert.equal((await cleared).status(), 200);
  actual = await getWorkspace();
  assert.ok(
    actual.rows.every((r) => r.values.company === '' && r.values.email === ''),
  );
  assert.deepEqual(
    actual.rows.map((r) => r.values.notes),
    before.rows.map((r) => r.values.notes),
  );
  await paste(
    'Pasted First\tfirst@example.test\nPasted Second\tsecond@example.test',
  );
  await page
    .getByLabel('Search rows', { exact: true })
    .fill('No matching rows xyz');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  for (const name of ['Delete active row', 'Enrich active row with Apollo'])
    assert.equal(
      await page
        .getByRole('menuitem', { name, exact: true })
        .getAttribute('aria-disabled'),
      'true',
    );
  await page.keyboard.press('Escape');
  await page.getByLabel('Search rows', { exact: true }).fill('Pasted Second');
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Record details' })
    .getByText('Pasted Second', { exact: true })
    .first()
    .waitFor();
  await page.getByRole('button', { name: 'Close record details' }).click();
  await page.getByRole('button', { name: /^Columns / }).click();
  const hidden = save();
  await page
    .getByRole('checkbox', { name: 'Show Notes', exact: true })
    .uncheck();
  assert.equal((await hidden).status(), 200);
  await close();
  await openExport();
  assert.equal(
    await page.getByRole('radio', { name: /Current view/ }).isChecked(),
    true,
  );
  await page.getByText('1 row · 4 columns', { exact: true }).waitFor();
  await page.screenshot({
    path: out + '/export-desktop.png',
    animations: 'disabled',
  });
  const view = await download('export-view.csv');
  assert.equal(view.length, 1);
  assert.equal(view[0].Company, 'Pasted Second');
  assert.ok(!Object.hasOwn(view[0], 'Notes'));
  await openExport();
  await page.getByRole('radio', { name: /Entire sheet/ }).check();
  await page.getByRole('checkbox', { name: 'Include hidden columns' }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  const box = await page.getByRole('dialog').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await page.screenshot({
    path: out + '/export-mobile.png',
    animations: 'disabled',
  });
  const all = await download('export-all.csv');
  assert.equal(all.length, 2);
  assert.equal(all[0].Notes, before.rows[0].values.notes);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Search rows', { exact: true }).fill('');
  await page.getByRole('button', { name: /^Columns / }).click();
  const shown = save();
  await page.getByRole('button', { name: 'Show all', exact: true }).click();
  assert.equal((await shown).status(), 200);
  await close();
  await page.reload();
  actual = await getWorkspace();
  assert.equal(actual.rows[0].values.company, 'Pasted First');
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    tableId,
    checks: [
      '2x2 paste preserves all cells',
      '2x2 clear preserves other fields',
      'filtered-out actions disabled',
      'record details follow visible row',
      'view export respects search and visibility',
      'entire-sheet export includes hidden columns on request',
      'mobile export fits',
      'edited values persist after reload',
    ],
    pageErrors: errors,
  };
  await writeFile(out + '/grid-ui.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
