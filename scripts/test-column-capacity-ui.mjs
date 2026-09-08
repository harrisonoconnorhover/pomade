// Capacity uses a synthetic browser snapshot; no saved sheet is changed.
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
const errors = [],
  saves = [];
page.on('pageerror', (e) => errors.push(e.message));
const before = (
  await (
    await page.request.get(origin + '/api/workspace?workspaceId=' + tableId)
  ).json()
).workspace;
assert.match(before.name, /^Night shift QA/);
let fixture = structuredClone(before);
fixture.columns = [
  { id: 'company', title: 'Company', kind: 'text', width: 180 },
  ...Array.from({ length: 97 }, (_, i) => ({
    id: 'qa_' + i,
    title: 'QA field ' + i,
    kind: 'text',
    width: 120,
  })),
  { id: 'status', title: 'Run status', kind: 'status', width: 140 },
];
fixture.rows = [{ id: 'qa-capacity', values: { company: 'Capacity test' } }];
fixture.source = undefined;
await page.route('**/api/workspace?*', (route) => {
  if (route.request().method() === 'PUT') {
    const value = route.request().postDataJSON().workspace;
    assert.ok(
      value.columns.length <= 100,
      'UI must never submit an unsaveable sheet',
    );
    saves.push(value);
    fixture = { ...value, revision: (fixture.revision ?? 0) + 1 };
  }
  return route.fulfill({ json: { workspace: fixture } });
});
const close = () =>
  page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
const rail = () =>
  page
    .getByRole('button', {
      name: 'Add a column: data, enrichment, research, or formula',
      exact: true,
    })
    .click();
try {
  await page.goto(origin + '/?table=' + tableId);
  await page.getByRole('button', { name: /^Columns 99\/99/ }).waitFor();
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.click(box.x + 95, box.y + 65, { button: 'right' });
  await page.getByRole('menuitem', { name: /^Add column…/ }).click();
  await page.getByRole('dialog', { name: 'What’s the next step?' }).waitFor();
  await page
    .getByRole('button', { name: /^AI research Ask a question/ })
    .click();
  await page
    .getByRole('button', { name: /^Parallel · quick web research/ })
    .click();
  await page.getByRole('button', { name: /^Structured fields/ }).click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'adds 4 columns, but only 1 space remains' })
    .waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Add structured research', exact: true })
      .isEnabled(),
    false,
  );
  await close();
  await rail();
  await page.getByRole('button', { name: /^Data field Text, number/ }).click();
  await page
    .getByLabel('Column name', { exact: true })
    .fill('Final available field');
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes('/api/workspace?') && r.request().method() === 'PUT',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add column', exact: true })
    .click();
  assert.equal((await saved).status(), 200);
  assert.equal(fixture.columns.length, 100);
  await rail();
  await page
    .getByRole('alert')
    .filter({ hasText: '100-column limit' })
    .waitFor();
  await page.getByRole('button', { name: /^Data field Text, number/ }).click();
  await page.getByLabel('Column name', { exact: true }).fill('Overflow');
  assert.equal(
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Add column', exact: true })
      .isEnabled(),
    false,
  );
  await close();
  await rail();
  await page
    .getByRole('button', { name: /^Formula Calculate, combine/ })
    .click();
  await page
    .getByRole('alert')
    .filter({ hasText: '100-column limit' })
    .waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Add formula column', exact: true })
      .isEnabled(),
    false,
  );
  await page
    .getByLabel('Find a column to insert', { exact: true })
    .fill('QA field 96');
  assert.equal(await page.locator('.formula-input-columns button').count(), 1);
  await page
    .locator('.formula-input-columns')
    .getByRole('button', { name: 'QA field 96', exact: true })
    .click();
  assert.match(
    await page.getByLabel('Formula', { exact: true }).inputValue(),
    /\{\{qa_96\}\}/,
  );
  await page
    .getByLabel('Find a column to insert', { exact: true })
    .fill('not-a-column');
  await page
    .getByText('No columns match this search.', { exact: true })
    .waitFor();
  await page.getByLabel('Find a column to insert', { exact: true }).fill('');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('alert').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: out + '/column-capacity-mobile.png',
    animations: 'disabled',
  });
  await close();
  assert.equal(saves.length, 1);
  assert.deepEqual(
    (
      await (
        await page.request.get(origin + '/api/workspace?workspaceId=' + tableId)
      ).json()
    ).workspace,
    before,
  );
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    checks: [
      'Right-click opens shared column picker',
      'Multi-output research accounts for remaining capacity',
      'Permanent rail adds final available column',
      'Data overflow stays blocked before save',
      'Formula overflow stays blocked before save',
      'Formula column search and insertion work with 100 columns',
      'Real saved sheet remains unchanged',
    ],
    pageErrors: errors,
  };
  await writeFile(
    out + '/column-capacity-ui.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
