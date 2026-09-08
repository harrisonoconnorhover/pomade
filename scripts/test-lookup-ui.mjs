// Real local lookup on disposable sheets. Source-reload failure is simulated.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const origin = 'http://localhost:8798',
  out = 'outputs/nightshift/2026-09-07';
const { tableId: targetId } = JSON.parse(
  await readFile(out + '/crm-live-fixture.json', 'utf8'),
);
const { newTable: sourceId } = JSON.parse(
  await readFile(out + '/csv-ui.json', 'utf8'),
);
const { tableId: domainSourceId } = JSON.parse(
  await readFile(out + '/ui-fixture.json', 'utf8'),
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
let failSource = false;
await page.route(origin + '/api/workspace?workspaceId=' + sourceId, (route) =>
  failSource
    ? route.fulfill({ status: 503, json: { error: 'QA source outage' } })
    : route.continue(),
);
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
const close = async () => {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
};
try {
  await page.goto(origin + '/?table=' + targetId);
  await open();
  await page.getByLabel('Source table', { exact: true }).selectOption(sourceId);
  await page
    .getByLabel('Match this table’s column', { exact: true })
    .selectOption('company');
  await page
    .getByLabel('To the source column', { exact: true })
    .selectOption('company');
  assert.equal(
    await page.getByLabel('Match rule', { exact: true }).inputValue(),
    'automatic',
  );
  await page
    .getByLabel('Match rule', { exact: true })
    .getByRole('option', { name: 'Automatic · Text', exact: true })
    .waitFor({ state: 'attached' });
  await page.getByRole('checkbox', { name: 'Notes', exact: true }).check();
  await page
    .locator('.lookup-preview')
    .getByText(target.rows[0].values.description, { exact: true })
    .waitFor();
  await page.getByLabel('Match rule', { exact: true }).selectOption('exact');
  await page
    .getByLabel('Source table', { exact: true })
    .selectOption(domainSourceId);
  await page
    .getByLabel('To the source column', { exact: true })
    .selectOption('domain');
  assert.equal(
    await page.getByLabel('Match rule', { exact: true }).inputValue(),
    'exact',
  );
  await page
    .getByLabel('Match this table’s column', { exact: true })
    .selectOption('domain');
  await page
    .getByLabel('Match rule', { exact: true })
    .selectOption('automatic');
  await page
    .getByLabel('Match rule', { exact: true })
    .getByRole('option', { name: 'Automatic · Website / domain', exact: true })
    .waitFor({ state: 'attached' });
  await page.getByLabel('Source table', { exact: true }).selectOption(sourceId);
  await page
    .getByLabel('Match this table’s column', { exact: true })
    .selectOption('company');
  await page
    .getByLabel('To the source column', { exact: true })
    .selectOption('company');
  await page.getByRole('checkbox', { name: 'Notes', exact: true }).check();
  await close();
  failSource = true;
  await open();
  await page
    .getByRole('alert')
    .filter({ hasText: 'Source table could not be loaded.' })
    .waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Add lookup column', exact: true })
      .isEnabled(),
    false,
  );
  assert.equal(await page.locator('.lookup-preview').count(), 0);
  failSource = false;
  await page.getByRole('button', { name: 'Retry source', exact: true }).click();
  await page
    .locator('.lookup-preview')
    .getByText(target.rows[0].values.description, { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole('checkbox', { name: 'Notes', exact: true })
      .isChecked(),
    true,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.lookup-preview').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: out + '/lookup-mobile.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  let lookup = target.columns.find(
    (c) =>
      c.recipe === 'table-lookup' &&
      c.lookup?.sourceTableId === sourceId &&
      c.inputBindings?.match === 'company' &&
      c.lookup.normalization === 'text' &&
      c.lookup.outputs.some((output) => output.sourceColumnId === 'notes'),
  );
  if (lookup) await close();
  else {
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes('/api/workspace?') && r.request().method() === 'PUT',
    );
    await page
      .getByRole('button', { name: 'Add lookup column', exact: true })
      .click();
    assert.equal((await saved).status(), 200);
    const configured = await get(targetId);
    lookup = configured.columns.find(
      (c) =>
        c.recipe === 'table-lookup' &&
        !target.columns.some((old) => old.id === c.id),
    );
  }
  assert.ok(lookup);
  assert.equal(lookup.lookup.normalization, 'text');
  assert.ok(
    (await get(targetId)).columns
      .filter((column) => column.recipe)
      .every((column) => column.recipe === 'table-lookup'),
    'Only local lookup recipes may run in this fixture',
  );
  const run = page.waitForResponse(
    (r) => r.url().endsWith('/api/runs') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Run 1 row', exact: true }).click();
  const response = await run;
  assert.equal(response.status(), 200);
  assert.equal(
    response.request().postDataJSON().confirmExternalResearch,
    false,
  );
  const after = await get(targetId);
  assert.equal(
    after.rows[0].values[lookup.id],
    target.rows[0].values.description,
  );
  assert.deepEqual(after.crmMappings, target.crmMappings);
  assert.deepEqual(after.tableTransfers, target.tableTransfers);
  assert.deepEqual(await get(sourceId), source);
  await page.reload();
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  assert.equal(
    (await get(targetId)).rows[0].values[lookup.id],
    target.rows[0].values.description,
  );
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    checks: [
      'Automatic text matches company names with spaces',
      'Manual rule survives source changes',
      'Automatic domain requires two domain fields',
      'Failed source reload disables stale preview and Add',
      'Retry preserves valid field selections',
      'Configured lookup runs locally and persists',
      'Source and existing CRM mappings remain unchanged',
    ],
    pageErrors: errors,
  };
  await writeFile(out + '/lookup-ui.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({
    path: out + '/lookup-failure.png',
    animations: 'disabled',
  });
  throw error;
} finally {
  await browser.close();
}
