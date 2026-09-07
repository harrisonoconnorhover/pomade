// Uses fake rows and a real local formula run; provider execution is never selected.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const origin = 'http://localhost:8798',
  out = 'outputs/nightshift/2026-09-07';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const api = async (path) => {
  const r = await page.request.get(origin + path);
  assert.equal(r.status(), 200);
  return r.json();
};
let checkFails = true;
const configured = {
  connections: [
    {
      id: 'pomade_apollo_people',
      label: 'Apollo',
      origin: 'https://api.apollo.io',
      methods: ['POST'],
    },
  ],
};
await page.route('**/api/providers/http', (route) =>
  route.fulfill({
    status: checkFails ? 503 : 200,
    contentType: 'application/json',
    body: JSON.stringify(
      checkFails ? { error: 'QA connection check unavailable' } : configured,
    ),
  }),
);
try {
  let fixture;
  try {
    fixture = JSON.parse(await readFile(out + '/run-fixture.json', 'utf8'));
  } catch {}
  if (!fixture) {
    const existing = (await api('/api/tables')).tables.find(
      (table) => table.name === 'Night shift QA run controls',
    );
    if (existing) fixture = { tableId: existing.id };
  }
  if (!fixture) {
    const r = await page.request.post(origin + '/api/tables', {
      data: { name: 'Night shift QA run controls', mode: 'empty' },
    });
    assert.equal(r.status(), 201);
    fixture = { tableId: (await r.json()).table.id };
    await writeFile(out + '/run-fixture.json', JSON.stringify(fixture));
  }
  await writeFile(out + '/run-fixture.json', JSON.stringify(fixture));
  const path = '/api/workspace?workspaceId=' + fixture.tableId;
  const before = (await api(path)).workspace;
  assert.match(before.name, /^Night shift QA/);
  const { tableId: catalogId } = JSON.parse(
    await readFile(out + '/ui-fixture.json', 'utf8'),
  );
  const catalog = (await api('/api/workspace?workspaceId=' + catalogId))
    .workspace;
  const lookup = structuredClone(
    catalog.columns.find(
      (c) =>
        c.recipe === 'http-waterfall' &&
        c.providerWaterfall.steps.length === 1 &&
        c.providerWaterfall.steps[0].connectionId === 'pomade_apollo_people',
    ),
  );
  assert.ok(lookup);
  lookup.id = 'email_lookup';
  lookup.title = 'Email lookup';
  lookup.providerWaterfall.winnerColumnId = 'email_provider';
  lookup.providerWaterfall.statusColumnId = 'email_status';
  const text = (id, title) => ({ id, title, kind: 'text', width: 170 });
  const workspace = {
    ...before,
    columns: [
      text('company', 'Company'),
      text('person', 'Person'),
      text('domain', 'Domain'),
      lookup,
      text('email_provider', 'Email provider'),
      text('email_status', 'Email status'),
      {
        id: 'label',
        title: 'Company label',
        kind: 'formula',
        recipe: 'custom-formula',
        expression: '{{company | upper}}',
        width: 220,
      },
      { id: 'status', title: 'Run status', kind: 'status', width: 140 },
    ],
    rows: Array.from({ length: 11 }, (_, i) => ({
      id: 'qa-run-' + i,
      values: {
        company: 'Example ' + i,
        person: 'Test Person',
        domain: 'example.test',
        email_lookup: '',
        email_provider: '',
        email_status: '',
        label: '',
        status: '',
      },
    })),
    updatedAt: Date.now(),
  };
  const put = await page.request.put(origin + path, {
    data: { workspace, baseWorkspace: before },
  });
  assert.equal(put.status(), 200);
  await page.goto(origin + '/?table=' + fixture.tableId);
  await page.getByRole('button', { name: 'Run 11 rows', exact: true }).click();
  let dialog = page.getByRole('dialog', {
    name: 'Review recipe run',
    exact: true,
  });
  await dialog.waitFor();
  await dialog.getByText('Not checked', { exact: true }).first().waitFor();
  assert.equal(await dialog.getByText('Ready now', { exact: true }).count(), 0);
  assert.equal(
    await dialog
      .getByRole('button', { name: 'Run 11 rows', exact: true })
      .isEnabled(),
    false,
  );
  await dialog
    .getByRole('button', { name: 'Use background', exact: true })
    .click();
  dialog = page.getByRole('dialog', {
    name: 'Review background run',
    exact: true,
  });
  await dialog.waitFor();
  assert.equal(
    await dialog
      .getByRole('button', { name: 'Queue 11 rows', exact: true })
      .isEnabled(),
    true,
  );
  checkFails = false;
  await dialog
    .getByRole('button', { name: 'Recheck connections', exact: true })
    .click();
  await dialog.getByText('Ready now', { exact: true }).first().waitFor();
  await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
  assert.equal(
    await dialog
      .getByRole('button', { name: 'Queue 11 rows', exact: true })
      .isEnabled(),
    false,
  );
  assert.equal(
    await dialog
      .getByRole('checkbox', { name: 'Run Email lookup', exact: true })
      .isChecked(),
    false,
  );
  await dialog
    .getByRole('checkbox', { name: 'Run Company label', exact: true })
    .check();
  await dialog.getByRole('radio', { name: 'Run now', exact: true }).check();
  dialog = page.getByRole('dialog', { name: 'Review recipe run', exact: true });
  await dialog
    .getByText('Selected recipes run locally without provider requests.', {
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: out + '/run-scope-desktop.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  const bounds = await dialog.boundingBox();
  assert.ok(
    bounds.x >= 0 &&
      bounds.x + bounds.width <= 390 &&
      bounds.y >= 0 &&
      bounds.y + bounds.height <= 844,
  );
  await page.screenshot({
    path: out + '/run-scope-mobile.png',
    animations: 'disabled',
  });
  const submitted = page.waitForRequest(
    (r) => new URL(r.url()).pathname === '/api/runs' && r.method() === 'POST',
  );
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/runs' &&
      r.request().method() === 'POST',
  );
  await dialog
    .getByRole('button', { name: 'Run 11 rows', exact: true })
    .click();
  const body = (await submitted).postDataJSON();
  assert.deepEqual(body.columnIds, ['label']);
  assert.equal(body.confirmExternalResearch, false);
  assert.equal((await response).status(), 200);
  const after = (await api(path)).workspace;
  assert.ok(after.rows.every((r, i) => r.values.label === `EXAMPLE ${i}`));
  assert.ok(after.rows.every((r) => r.values.email_lookup === ''));
  await page.reload();
  await page
    .getByRole('button', { name: 'Run 11 rows', exact: true })
    .waitFor();
  assert.deepEqual((await api(path)).workspace.rows, after.rows);
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    tableId: fixture.tableId,
    checks: [
      'oversized immediate run disabled',
      'background shortcut preserves selection',
      'failed connection check is not Ready',
      'connection recheck recovers',
      'empty column scope cannot run',
      'local-only scope sends no provider consent',
      'actual 11-row formula run persists',
      'mobile run dialog fits',
    ],
    pageErrors: errors,
  };
  await writeFile(out + '/run-scope-ui.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
