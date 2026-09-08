import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const origin = 'http://localhost:8798';
const out = 'outputs/nightshift/2026-09-07';
const { newTable: tableId } = JSON.parse(
  await readFile(out + '/csv-ui.json', 'utf8'),
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  const before = await (
    await page.request.get(origin + '/api/workspace?workspaceId=' + tableId)
  ).json();
  await page.goto(origin + '/?table=' + tableId);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Add AI web research', exact: true })
    .click();
  await page
    .getByRole('button', { name: /^Parallel · quick web research/ })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Add AI web research',
    exact: true,
  });
  await dialog.waitFor();
  const prompt = dialog.getByLabel('Research prompt', { exact: true });
  const original = await prompt.inputValue();
  await dialog.getByRole('button', { name: /^List into rows/ }).click();
  assert.notEqual(await prompt.inputValue(), original);
  await dialog.getByRole('button', { name: /^One answer/ }).click();
  assert.equal(await prompt.inputValue(), original);
  const custom =
    'Find open SDR roles posted in the last month and include their locations for {{company}}.';
  await prompt.fill(custom);
  await dialog.getByRole('button', { name: /^Structured fields/ }).click();
  await dialog
    .getByLabel('Output field 1 name', { exact: true })
    .fill('Open SDR roles');
  await dialog
    .getByLabel('Output field 1 type', { exact: true })
    .selectOption('number');
  await dialog
    .getByLabel('Output field 2 name', { exact: true })
    .fill('Hiring location');
  await dialog
    .getByLabel('Output field 2 type', { exact: true })
    .selectOption('text');
  for (const mode of ['One answer', 'List into rows', 'Structured fields']) {
    await dialog.getByRole('button', { name: new RegExp('^' + mode) }).click();
    assert.equal(await prompt.inputValue(), custom);
    if (mode !== 'One answer') {
      assert.equal(
        await dialog
          .getByLabel('Output field 1 name', { exact: true })
          .inputValue(),
        'Open SDR roles',
      );
      assert.equal(
        await dialog
          .getByLabel('Output field 1 type', { exact: true })
          .inputValue(),
        'number',
      );
      assert.equal(
        await dialog
          .getByLabel('Output field 2 name', { exact: true })
          .inputValue(),
        'Hiring location',
      );
      assert.equal(
        await dialog
          .getByLabel('Output field 2 type', { exact: true })
          .inputValue(),
        'text',
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  const bounds = await dialog.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
  await page.screenshot({
    path: out + '/research-draft-mobile.png',
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const after = await (
    await page.request.get(origin + '/api/workspace?workspaceId=' + tableId)
  ).json();
  assert.deepEqual(after.workspace, before.workspace);
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    checks: [
      'Untouched defaults adapt to output format',
      'Custom prompt survives all formats',
      'Custom field names and types survive all formats',
      'Mobile dialog fits viewport',
      'Cancelling leaves sheet unchanged',
    ],
    pageErrors: errors,
  };
  await writeFile(
    out + '/research-draft-ui.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
