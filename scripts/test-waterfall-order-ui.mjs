// Draft only: run after the inline waterfall-order build is ready.
// All workspace saves are intercepted; no provider or saved-sheet writes occur.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const repo = process.cwd();
const origin = 'http://localhost:8798';
const { newTable: tableId } = JSON.parse(
  await readFile(repo + '/outputs/nightshift/2026-09-07/csv-ui.json', 'utf8'),
);
assert.ok(tableId);
const workspaceUrl = origin + '/api/workspace?workspaceId=' + tableId;
async function readRealWorkspace() {
  const response = await fetch(workspaceUrl);
  assert.equal(response.status, 200);
  return (await response.json()).workspace;
}
const before = await readRealWorkspace();
assert.match(before.name, /^Night shift QA/);
const waterfallId = 'qa_email';
const winnerId = 'custom_winner_17';
const statusId = 'custom_status_18';
const steps = [
  {
    connectionId: 'qa_alpha',
    method: 'GET',
    pathTemplate: '/find?domain={{lookup_domain}}',
    responsePath: 'data.email',
    verification: { path: 'data.status', acceptedValues: ['verified'] },
  },
  {
    connectionId: 'qa_beta',
    method: 'POST',
    pathTemplate: '/enrich',
    bodyTemplate: '{"person":"{{lookup_name}}","domain":"{{lookup_domain}}"}',
    responsePath: 'person.email',
    verifier: { presetId: 'hunter-verify' },
  },
  {
    connectionId: 'qa_gamma',
    method: 'GET',
    pathTemplate: '/email?person={{lookup_name}}&domain={{lookup_domain}}',
    responsePath: 'email',
    verification: { path: 'status', acceptedValues: ['valid'] },
  },
];
const textColumn = (id, title, width = 180) => ({
  id,
  title,
  width,
  kind: 'text',
});
let fixture = {
  ...structuredClone(before),
  columns: [
    textColumn('company', 'Company'),
    {
      id: waterfallId,
      title: 'Verified work email',
      kind: 'enrichment',
      recipe: 'http-waterfall',
      width: 260,
      inputBindings: { lookup_name: 'person', lookup_domain: 'domain' },
      runCondition: { field: 'company', operator: 'is_not_empty' },
      providerWaterfall: {
        steps: structuredClone(steps),
        accept: 'verified-email',
        continueOnError: false,
        winnerColumnId: winnerId,
        statusColumnId: statusId,
      },
      outputFields: [
        { id: waterfallId, title: 'Verified work email', valueType: 'text' },
        { id: winnerId, title: 'Saved provider', valueType: 'text' },
        { id: statusId, title: 'Saved lookup outcome', valueType: 'text' },
      ],
    },
    textColumn('person', 'Person'),
    textColumn('domain', 'Domain'),
    textColumn(winnerId, 'Saved provider'),
    textColumn(statusId, 'Saved lookup outcome', 220),
    { id: 'status', title: 'Run status', kind: 'status', width: 140 },
  ],
  rows: [
    {
      id: 'qa-waterfall-order-1',
      values: {
        company: 'Waterfall order QA',
        person: 'QA Person',
        domain: 'example.test',
        [waterfallId]: 'qa.person@example.test',
        [winnerId]: 'An earlier winning provider',
        [statusId]: 'Accepted before settings changed',
        status: 'Ready',
      },
    },
  ],
  source: undefined,
  schedule: undefined,
  workbookPlan: undefined,
  tableTransfers: undefined,
};
fixture = JSON.parse(JSON.stringify(fixture));
const initialFixture = structuredClone(fixture);
const saves = [];
const blockedRequests = [];
const pageErrors = [];
let jobs = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12_000);
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  if (
    url.origin === origin &&
    url.pathname === '/api/workspace' &&
    url.searchParams.get('workspaceId') === tableId
  ) {
    if (method === 'GET')
      return route.fulfill({ json: { workspace: fixture } });
    if (method === 'PUT') {
      const payload = request.postDataJSON();
      assert.equal(payload.workspace.id, tableId);
      saves.push(structuredClone(payload.workspace));
      fixture = structuredClone(payload.workspace);
      return route.fulfill({ json: { workspace: fixture } });
    }
  }
  if (url.origin === origin && method === 'GET') {
    // The actual background-run status endpoint is /api/jobs.
    if (url.pathname === '/api/jobs') return route.fulfill({ json: { jobs } });
    if (url.pathname === '/api/runs')
      return route.fulfill({ json: { runs: [] } });
    if (url.pathname === '/api/providers/http')
      return route.fulfill({ json: { connections: [] } });
    if (url.pathname === '/api/providers/research')
      return route.fulfill({
        json: {
          provider: 'parallel',
          configured: false,
          ready: false,
          label: 'Parallel',
          model: 'QA synthetic status',
          alternatives: [],
          capabilities: {
            webResearch: true,
            citations: true,
            maximumActionsPerRun: 10,
          },
        },
      });
  }
  if (!['GET', 'HEAD'].includes(method)) {
    blockedRequests.push({ method, path: url.pathname });
    return route.fulfill({
      status: 409,
      json: { error: 'UI test blocks real writes and execution.' },
    });
  }
  if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
    blockedRequests.push({ method, path: url.origin + url.pathname });
    return route.abort();
  }
  return route.continue();
});

const settings = () =>
  page.getByRole('dialog', { name: 'Column settings', exact: true });
async function openSettings() {
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible' });
  const box = await canvas.boundingBox();
  assert.ok(box);
  await page.mouse.click(box.x + 52 + 180 + 90, box.y + 20, {
    button: 'right',
  });
  await page
    .getByRole('menuitem', { name: 'Column settings', exact: true })
    .click();
  const dialog = settings();
  await dialog.waitFor();
  assert.equal(
    await dialog.getByLabel('Column name', { exact: true }).inputValue(),
    'Verified work email',
  );
  await dialog.getByText('Provider order', { exact: true }).waitFor();
  return dialog;
}
async function assertOrder(dialog, expected) {
  assert.deepEqual(
    await dialog
      .locator('.column-waterfall-settings .waterfall-step-label strong')
      .allTextContents(),
    expected,
  );
}
async function assertDirtyRunButtons(dialog) {
  assert.equal(
    await dialog
      .getByRole('button', { name: 'Run now', exact: true })
      .isEnabled(),
    false,
  );
  assert.equal(
    await dialog
      .getByRole('button', { name: 'Queue', exact: true })
      .isEnabled(),
    false,
  );
}
async function cancel(dialog) {
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await delay(800); // Beyond the existing 500ms autosave debounce.
}
const errorChoice = (dialog) =>
  dialog.getByRole('checkbox', {
    name: 'Try the next provider if one returns an error',
    exact: true,
  });

try {
  await page.goto(origin + '/?table=' + tableId);
  let dialog = await openSettings();
  await assertOrder(dialog, ['qa alpha', 'qa beta', 'qa gamma']);
  assert.equal(await errorChoice(dialog).isChecked(), false);
  await dialog
    .getByRole('button', { name: 'Move provider 1 down', exact: true })
    .click();
  await assertOrder(dialog, ['qa beta', 'qa alpha', 'qa gamma']);
  await assertDirtyRunButtons(dialog);
  await cancel(dialog);
  assert.equal(saves.length, 0, 'Cancelling provider reordering must not PUT.');
  assert.deepEqual(fixture, initialFixture);

  dialog = await openSettings();
  await assertOrder(dialog, ['qa alpha', 'qa beta', 'qa gamma']);
  await dialog
    .getByRole('button', { name: 'Move provider 1 down', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Move provider 2 down', exact: true })
    .click();
  await assertOrder(dialog, ['qa beta', 'qa gamma', 'qa alpha']);
  await errorChoice(dialog).check();
  await assertDirtyRunButtons(dialog);
  const savedResponse = page.waitForResponse(
    (response) =>
      response.url() === workspaceUrl && response.request().method() === 'PUT',
  );
  await dialog
    .getByRole('button', { name: 'Save settings', exact: true })
    .click();
  assert.equal((await savedResponse).status(), 200);
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(saves.length, 1);
  const saved = saves[0];
  const expectedColumn = {
    ...initialFixture.columns[1],
    providerWaterfall: {
      ...initialFixture.columns[1].providerWaterfall,
      steps: [steps[1], steps[2], steps[0]],
      continueOnError: true,
    },
  };
  assert.deepEqual(
    saved.columns[1],
    expectedColumn,
    'Only provider order/error behavior may change; IDs, bindings and request details must survive.',
  );
  assert.deepEqual(
    saved.columns.map((column) => column.id),
    initialFixture.columns.map((column) => column.id),
  );
  assert.deepEqual(
    saved.columns.filter((column) => column.id !== waterfallId),
    initialFixture.columns.filter((column) => column.id !== waterfallId),
  );
  assert.deepEqual(
    saved.rows,
    initialFixture.rows,
    'Existing results and row IDs must survive settings edits.',
  );

  await page.reload();
  dialog = await openSettings();
  await assertOrder(dialog, ['qa beta', 'qa gamma', 'qa alpha']);
  assert.equal(await errorChoice(dialog).isChecked(), true);
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/waterfall-order-desktop.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.locator('.column-waterfall-settings').scrollIntoViewIfNeeded();
  const box = await dialog.boundingBox();
  assert.ok(
    box && box.x >= -1 && box.x + box.width <= 391,
    'Phone dialog must fit horizontally.',
  );
  assert.ok(
    box.y >= -1 && box.y + box.height <= 845,
    'Phone dialog must fit vertically with internal scrolling.',
  );
  const overflow = await dialog.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  console.log(
    JSON.stringify({
      mobileGeometry: await dialog.evaluate((element) => {
        const style = getComputedStyle(element);
        const footer = element.querySelector('.rename-actions');
        const footerStyle = footer && getComputedStyle(footer);
        return {
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          dialogPadding: style.padding,
          footerMargin: footerStyle?.margin,
          footerWidth: footer?.getBoundingClientRect().width,
        };
      }),
    }),
  );
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    'Provider-order controls must not cause horizontal overflow.',
  );
  for (const button of await dialog
    .getByRole('button', { name: /^Move provider/ })
    .all()) {
    const bounds = await button.boundingBox();
    assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= 391);
  }
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/waterfall-order-mobile.png',
    animations: 'disabled',
  });
  await dialog
    .getByRole('button', { name: 'Save settings', exact: true })
    .scrollIntoViewIfNeeded();
  await cancel(dialog);
  assert.equal(saves.length, 1);

  // A paused relevant job with an expired lease leaves the grid editable,
  // but provider order must stay locked to preserve that run's request state.
  const now = Date.now();
  jobs = [
    {
      id: 'qa-paused-waterfall-job',
      workspaceId: tableId,
      status: 'paused',
      rowIds: [fixture.rows[0].id],
      columnIds: [waterfallId],
      cursor: 0,
      completedCount: 0,
      skippedCount: 0,
      confirmExternalResearch: true,
      createdAt: now - 60_000,
      updatedAt: now,
      leaseUntil: now - 1,
      waitingMessage: 'Synthetic provider result is pending.',
    },
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  const loadedJobs = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/jobs' &&
      response.request().method() === 'GET',
  );
  await page.reload();
  assert.equal((await loadedJobs).status(), 200);
  dialog = await openSettings();
  await dialog
    .getByText(/A paused or failed run still uses this waterfall/)
    .waitFor();
  const controls = dialog.getByRole('button', { name: /^Move provider/ });
  assert.equal(await controls.count(), 6);
  for (const control of await controls.all())
    assert.equal(await control.isEnabled(), false);
  assert.equal(await errorChoice(dialog).isEnabled(), false);
  await assertOrder(dialog, ['qa beta', 'qa gamma', 'qa alpha']);
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/waterfall-order-paused.png',
    animations: 'disabled',
  });
  await dialog
    .getByRole('button', { name: 'Open background runs', exact: true })
    .click();
  const background = page.getByRole('dialog', {
    name: 'Background runs',
    exact: true,
  });
  await background.waitFor();
  await background.getByText('1 row background run', { exact: true }).waitFor();
  await background.locator('.run-job-paused').waitFor();
  assert.equal(saves.length, 1);
  assert.deepEqual(
    blockedRequests,
    [],
    'No provider execution or other mutation may be attempted.',
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(
    await readRealWorkspace(),
    before,
    'The real disposable fixture must remain unchanged.',
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        fixture: tableId,
        interceptedPuts: saves.length,
        savedDataWrites: 0,
        checks: [
          'Second-column settings show all three existing providers',
          'Provider 1 moves down in the draft; Cancel sends no PUT',
          'Dirty provider settings disable Run now and Queue',
          'Save preserves remapped output IDs, bindings, verifier/request configuration and saved results',
          'Reopen reflects reordered providers and error behavior',
          'Provider order fits a 390px phone viewport',
          'A relevant paused job disables order/error changes',
          'Open background runs navigates to the paused job without mutation',
          'No provider calls or real saved data writes',
        ],
        pageErrors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({
    path: 'outputs/nightshift/2026-09-07/waterfall-order-failure.png',
    animations: 'disabled',
  });
  throw error;
} finally {
  await browser.close();
}
