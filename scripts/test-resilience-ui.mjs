// Browser failures are simulated; saved-state reconciliation uses the real local API.
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
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() =>
  Object.defineProperty(navigator, 'clipboard', {
    value: {},
    configurable: true,
  }),
);
let historyFails = true,
  saveFails = true,
  jobRevision = 1,
  restorePosts = 0;
const path = '/api/workspace?workspaceId=' + tableId;
const get = async () => {
  const r = await page.request.get(origin + path);
  assert.equal(r.status(), 200);
  return (await r.json()).workspace;
};
const before = await get();
assert.match(before.name, /^Night shift QA/);
await page.route('**/api/runs?*', (route) =>
  historyFails
    ? route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'QA history outage' }),
      })
    : route.continue(),
);
await page.route('**/api/jobs?*', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      jobs: [
        {
          id: 'qa-expired-paused',
          workspaceId: tableId,
          status: 'paused',
          rowIds: [before.rows[0].id],
          cursor: 0,
          completedCount: 0,
          skippedCount: 0,
          confirmExternalResearch: false,
          createdAt: 1,
          updatedAt: jobRevision,
          leaseUntil: 1,
        },
      ],
    }),
  }),
);
await page.route('**/api/workspace?*', (route) =>
  route.request().method() === 'PUT' && saveFails
    ? route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'QA save outage; edits remain in this tab.',
        }),
      })
    : route.continue(),
);
page.on('request', (r) => {
  if (
    new URL(r.url()).pathname === '/api/workspace/versions' &&
    r.method() === 'POST'
  )
    restorePosts++;
});
const more = async (name) => {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
};
const close = () =>
  page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
try {
  await page.goto(origin + '/?table=' + tableId);
  await page.getByRole('button', { name: 'More', exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'New table', exact: true })
      .isEnabled(),
    true,
  );
  await page.getByRole('button', { name: /^Run history/ }).click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'Run history is unavailable' })
    .waitFor();
  historyFails = false;
  await page
    .getByRole('button', { name: 'Retry run history', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Refresh run history', exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole('alert')
      .filter({ hasText: 'Run history is unavailable' })
      .count(),
    0,
  );
  await close();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  assert.equal(
    await page
      .getByRole('menuitem', { name: 'Add blank row', exact: true })
      .isEnabled(),
    true,
  );
  await page.keyboard.press('Escape');
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.click(box.x + 90, box.y + 65);
  let failed = page.waitForResponse(
    (r) =>
      r.url().includes('/api/workspace?') &&
      r.request().method() === 'PUT' &&
      r.status() === 503,
  );
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Unsaved QA edit');
    window.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await failed;
  await more('Version history');
  await page.getByRole('dialog', { name: 'Version history' }).waitFor();
  await page
    .getByRole('button', { name: 'Restore', exact: true })
    .first()
    .waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Restore', exact: true })
      .first()
      .isEnabled(),
    false,
  );
  assert.equal(restorePosts, 0);
  await close();
  const remote = {
    ...before,
    rows: before.rows.map((row, i) =>
      i === 0
        ? { ...row, values: { ...row.values, notes: 'Remote QA job result' } }
        : row,
    ),
    updatedAt: Date.now(),
  };
  const updated = await page.request.put(origin + path, {
    data: { workspace: remote, baseWorkspace: before },
  });
  assert.equal(updated.status(), 200);
  failed = page.waitForResponse((r) => {
    if (
      !r.url().includes('/api/workspace?') ||
      r.request().method() !== 'PUT' ||
      r.status() !== 503
    )
      return false;
    const values = r.request().postDataJSON().workspace.rows[0].values;
    return (
      values.company === 'Unsaved QA edit' &&
      values.notes === 'Remote QA job result'
    );
  });
  jobRevision = 2;
  await failed;
  saveFails = false;
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes('/api/workspace?') &&
      r.request().method() === 'PUT' &&
      r.status() === 200,
  );
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await saved;
  const actual = await get();
  assert.equal(actual.rows[0].values.company, 'Unsaved QA edit');
  assert.equal(actual.rows[0].values.notes, 'Remote QA job result');
  assert.deepEqual(actual.rows.slice(1), before.rows.slice(1));
  await more('Version history');
  assert.equal(
    await page
      .getByRole('button', { name: 'Restore', exact: true })
      .first()
      .isEnabled(),
    true,
  );
  assert.equal(restorePosts, 0);
  await close();
  await page.reload();
  await page.getByRole('button', { name: 'More', exact: true }).waitFor();
  assert.deepEqual((await get()).rows, actual.rows);
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    tableId,
    checks: [
      'history outage does not block sheet or navigation',
      'history retry recovers',
      'expired paused lease allows editing',
      'restore disabled while save fails',
      'job result and unsaved edit both preserved',
      'retry save persists merged state',
      'restore becomes available after save',
      'reload preserves edits',
    ],
    pageErrors: errors,
  };
  await writeFile(out + '/resilience-ui.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
