// CRM responses are mocked; the saved source and row preservation use the real local API.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const origin = 'http://localhost:8798',
  out = 'outputs/nightshift/2026-09-07';
const { tableId } = JSON.parse(
  await readFile(out + '/ui-fixture.json', 'utf8'),
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const segment = {
  id: 'qa_empty',
  name: 'Empty QA segment',
  objectType: 'company',
  processingType: 'DYNAMIC',
  size: 0,
};
const source = {
  provider: 'hubspot',
  objectType: 'company',
  segmentId: 'qa_empty',
  fields: [],
};
const state = {
  workspaceId: tableId,
  source,
  cadence: 'every_day',
  maxRecords: 37,
  status: 'idle',
};
const refreshRequests = [],
  previewRequests = [];
await page.route('**/api/providers/crm', (route) => {
  if (route.request().method() === 'GET')
    return route.fulfill({
      json: {
        providers: {
          hubspot: { configured: true, label: 'HubSpot', mode: 'read_only' },
          salesforce: {
            configured: false,
            label: 'Salesforce',
            mode: 'read_only',
          },
        },
      },
    });
  previewRequests.push(route.request().postDataJSON());
  return route.fulfill({
    json: {
      preview: {
        provider: 'hubspot',
        objectType: 'company',
        sourceLabel: 'HubSpot companies · Empty QA segment',
        segment,
        fields: [],
        contacts: [],
        truncated: false,
        readAt: new Date().toISOString(),
      },
    },
  });
});
await page.route('**/api/providers/crm/segments?*', (route) =>
  route.fulfill({ json: { segments: [segment] } }),
);
await page.route('**/api/providers/accounts', (route) =>
  route.fulfill({ json: { accounts: [] } }),
);
await page.route('**/api/crm-refresh**', (route) => {
  if (route.request().method() === 'POST')
    refreshRequests.push(route.request().postDataJSON());
  return route.fulfill({ json: { state } });
});
const path = '/api/workspace?workspaceId=' + tableId;
const get = async () => {
  const r = await page.request.get(origin + path);
  assert.equal(r.status(), 200);
  return (await r.json()).workspace;
};
const before = await get();
assert.match(before.name, /^Night shift QA/);
const close = () =>
  page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
try {
  await page.goto(origin + '/?table=' + tableId);
  await page.getByRole('button', { name: 'Add data', exact: true }).click();
  await page.getByRole('button', { name: 'Load data', exact: true }).click();
  await page
    .getByLabel('hubspot object to import', { exact: true })
    .selectOption('company');
  await page
    .getByLabel('HubSpot segment', { exact: true })
    .selectOption('qa_empty');
  await page
    .locator('.source-card')
    .filter({ has: page.getByText('HubSpot', { exact: true }) })
    .getByRole('button', { name: 'Preview up to 100', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Save source for refresh', exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Replace rows', exact: true })
      .isEnabled(),
    false,
  );
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes('/api/workspace?') && r.request().method() === 'PUT',
  );
  await page
    .getByRole('button', { name: 'Save source for refresh', exact: true })
    .click();
  assert.equal((await saved).status(), 200);
  const imported = await get();
  assert.equal(imported.source.segment.id, 'qa_empty');
  assert.deepEqual(
    imported.rows.map((r) => r.id),
    before.rows.map((r) => r.id),
  );
  for (const row of before.rows)
    for (const [field, value] of Object.entries(row.values))
      assert.equal(
        imported.rows.find((r) => r.id === row.id).values[field],
        value,
      );
  assert.deepEqual(
    imported.columns.filter((c) => c.recipe),
    before.columns.filter((c) => c.recipe),
  );
  assert.equal(previewRequests.at(-1).segmentId, 'qa_empty');
  assert.equal(previewRequests.at(-1).objectType, 'company');
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await page
    .getByRole('button', { name: 'Refresh settings', exact: true })
    .click();
  await page.getByLabel('Maximum records per refresh').waitFor();
  assert.equal(
    await page.getByLabel('Maximum records per refresh').inputValue(),
    '37',
  );
  await page.getByLabel('Maximum records per refresh').fill('999');
  await close();
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await page
    .getByRole('button', { name: 'Refresh settings', exact: true })
    .click();
  assert.equal(
    await page.getByLabel('Maximum records per refresh').inputValue(),
    '37',
  );
  await page.screenshot({
    path: out + '/crm-refresh-settings.png',
    animations: 'disabled',
  });
  await close();
  assert.equal(refreshRequests.length, 2);
  for (const request of refreshRequests)
    assert.deepEqual(request, { workspaceId: tableId, action: 'refresh' });
  assert.deepEqual(errors, []);
  // Remove the synthetic segment reference, leaving all saved row values and recipes intact.
  const current = await get();
  const restored = await page.request.put(origin + path, {
    data: {
      workspace: { ...current, source: before.source, updatedAt: Date.now() },
      baseWorkspace: current,
    },
  });
  assert.equal(restored.status(), 200);
  const result = {
    passed: true,
    tableId,
    checks: [
      'segment list and selection used by preview',
      'empty source can be saved',
      'empty preview cannot replace rows',
      'original values and recipes preserved',
      'refresh uses saved settings before settings dialog opens',
      'discarded settings draft does not alter refresh',
      'synthetic source reference removed',
    ],
    pageErrors: errors,
  };
  await writeFile(out + '/crm-source-ui.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
