// Actual local transfer between two disposable sheets; no provider or CRM calls.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const origin = 'http://localhost:8798',
  out = 'outputs/nightshift/2026-09-07';
const { tableId: sourceId } = JSON.parse(
  await readFile(out + '/crm-live-fixture.json', 'utf8'),
);
const { newTable: targetId } = JSON.parse(
  await readFile(out + '/csv-ui.json', 'utf8'),
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const get = async (id) =>
  (
    await (
      await page.request.get(origin + '/api/workspace?workspaceId=' + id)
    ).json()
  ).workspace;
const source = await get(sourceId),
  target = await get(targetId);
assert.match(source.name, /^Night shift QA/);
assert.match(target.name, /^Night shift QA/);
const company = source.rows[0].values.company;
const close = async () => {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
};
const marker = async () => {
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.click(box.x + 25, box.y + 65);
};
try {
  await page.goto(origin + '/?table=' + sourceId);
  await marker();
  await page.getByText('1 selected', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page
    .getByRole('button', { name: 'Transfer to table', exact: true })
    .click();
  const existingRule = source.tableTransfers?.find(
    (rule) =>
      rule.name === 'Night shift QA local transfer' &&
      rule.targetTableId === targetId,
  );
  if (existingRule)
    await page
      .getByLabel('Saved rule', { exact: true })
      .selectOption(existingRule.id);
  else
    await page
      .getByLabel('Destination', { exact: true })
      .selectOption(targetId);
  await page
    .getByLabel('Rule name', { exact: true })
    .fill('Night shift QA local transfer');
  await page
    .getByLabel('Source match key', { exact: true })
    .selectOption('company');
  await page
    .getByLabel('Destination match key', { exact: true })
    .selectOption('company');
  await page.getByLabel('Match rule', { exact: true }).selectOption('text');
  await page
    .getByLabel('Map Notes', { exact: true })
    .selectOption('description');
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes('/api/workspace?') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save rule', exact: true }).click();
  assert.equal((await saved).status(), 200);
  await page
    .getByRole('checkbox', { name: 'Use selected rows', exact: true })
    .check();
  await close();
  await marker();
  await page
    .getByText('1 selected', { exact: true })
    .waitFor({ state: 'hidden' });
  await page
    .getByRole('button', { name: 'Transfer to table', exact: true })
    .click();
  const selection = page.getByRole('checkbox', {
    name: 'Use selected rows',
    exact: true,
  });
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="Destination"]')?.disabled,
  );
  assert.equal(await selection.isChecked(), true);
  assert.equal(await selection.isEnabled(), true);
  assert.equal(
    await page
      .getByRole('button', { name: 'Preview transfer', exact: true })
      .isEnabled(),
    false,
  );
  await page
    .getByRole('alert')
    .filter({ hasText: 'No rows are selected.' })
    .waitFor();
  await selection.uncheck();
  const previewResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/transfers') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Preview transfer', exact: true })
    .click();
  const preview = await (await previewResponse).json();
  assert.equal(preview.preview.review, 0);
  const already = target.rows.some((row) => row.values.company === company);
  assert.equal(preview.preview.added, already ? 0 : 1);
  await page.locator('summary').filter({ hasText: company }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('summary')
    .filter({ hasText: company })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: out + '/transfer-preview-mobile.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (preview.preview.added || preview.preview.updated) {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/transfers') && r.request().method() === 'POST',
    );
    await page
      .getByRole('button', {
        name: 'Apply preview to ' + target.name,
        exact: true,
      })
      .click();
    const receipt = await (await response).json();
    assert.ok(receipt.receipt);
    await page
      .getByRole('status')
      .filter({ hasText: 'Transfer saved:' })
      .waitFor();
  }
  const after = await get(targetId);
  assert.equal(after.rows.length, target.rows.length + (already ? 0 : 1));
  for (const row of target.rows.filter((row) => row.values.company !== company))
    assert.deepEqual(
      after.rows.find((r) => r.id === row.id),
      row,
    );
  assert.equal(
    after.rows.find((row) => row.values.company === company).values.notes,
    source.rows[0].values.description,
  );
  const rerunResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/transfers') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Preview transfer', exact: true })
    .click();
  const rerun = await (await rerunResponse).json();
  assert.equal(rerun.preview.added + rerun.preview.updated, 0);
  assert.equal(
    await page
      .getByRole('button', {
        name: 'Apply preview to ' + target.name,
        exact: true,
      })
      .isEnabled(),
    false,
  );
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    sourceId,
    targetId,
    checks: [
      'Saved transfer mapping persists',
      'Selection can be turned off after clearing checked rows',
      'Empty selection never silently expands',
      'Preview uses recognizable company name',
      'Local transfer preserves unrelated target rows',
      'Mapped values persist in target',
      'Second preview avoids duplicates',
    ],
    pageErrors: errors,
  };
  await writeFile(out + '/transfer-ui.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({
    path: out + '/transfer-failure.png',
    animations: 'disabled',
  });
  throw error;
} finally {
  await browser.close();
}
