// Authorized local QA: change exactly one disposable waterfall flag and restore it.
// All provider reads are mocked. All writes except this exact workspace PUT are blocked.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = 'http://localhost:8798';
const tableId = '1e055937-b820-4cf4-9e13-b7051233d1f0';
const tableName = 'Night shift QA — disposable';
const columnId = 'apollo_find_verified_email';
const columnTitle = 'Apollo · find verified email';
const workspaceUrl = `${origin}/api/workspace?workspaceId=${tableId}`;
const checkboxName = 'Try the next provider if one returns an error';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const errors = [], consoleErrors = [], failedResponses = [], blockedWrites = [], externalRequests = [], uiPuts = [];
let original, originalFlag, restored = false, fallbackUsed = false, databaseReads = 0;
const getColumn = (snapshot) => snapshot.columns.find((column) => column.id === columnId);
const content = (snapshot) => {
  const cloned = structuredClone(snapshot);
  delete cloned.revision;
  delete cloned.updatedAt;
  return cloned;
};
const contentWithoutChangedFlag = (snapshot) => {
  const cloned = content(snapshot);
  getColumn(cloned).providerWaterfall.continueOnError = originalFlag;
  return cloned;
};
async function readSnapshot() {
  const response = await context.request.get(workspaceUrl);
  assert.equal(response.status(), 200, 'Disposable workspace must be readable.');
  databaseReads++;
  const { workspace } = await response.json();
  assert.equal(workspace.id, tableId);
  assert.equal(workspace.name, tableName);
  return workspace;
}
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('response', (response) => {
  if (new URL(response.url()).origin === origin && response.status() >= 400)
    failedResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
});
await page.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const json = (value) => route.fulfill({ json: value });
  if (!['http:', 'https:'].includes(url.protocol)) return route.continue();
  if (url.origin !== origin) {
    externalRequests.push({ origin: url.origin, method });
    return route.abort('blockedbyclient');
  }
  if (!url.pathname.startsWith('/api/')) return route.continue();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (method === 'PUT' && url.pathname === '/api/workspace' && url.searchParams.get('workspaceId') === tableId) {
      try {
        const body = request.postDataJSON();
        assert.ok(original, 'Original snapshot must be captured before any change.');
        assert.equal(body.workspace.id, tableId);
        assert.deepEqual(contentWithoutChangedFlag(body.workspace), content(original), 'Only the authorized waterfall flag may differ from the original sheet.');
        uiPuts.push({ flag: getColumn(body.workspace).providerWaterfall.continueOnError });
        return route.continue();
      } catch (error) {
        blockedWrites.push({ path: url.pathname, method, reason: error.message });
        return route.abort('blockedbyclient');
      }
    }
    blockedWrites.push({ path: url.pathname, method });
    return route.abort('blockedbyclient');
  }
  if (url.pathname === '/api/providers/apollo') return json({
    configured: false, capabilities: { personMatch: false, verifiedWorkEmail: false, phoneReveal: false },
  });
  if (url.pathname === '/api/providers/crm') return json({ providers: {
    hubspot: { configured: false, label: 'HubSpot contacts', mode: 'read_only' },
    salesforce: { configured: false, label: 'Salesforce leads', mode: 'read_only' },
  } });
  if (url.pathname === '/api/providers/research') return json({
    provider: 'parallel', configured: false, ready: false, label: 'Parallel', alternatives: [],
    capabilities: { webResearch: false, citations: false, maximumActionsPerRun: 0 },
  });
  if (url.pathname === '/api/providers/research/settings') return json({ defaults: {}, models: [], updatedAt: 0 });
  if (url.pathname.startsWith('/api/providers/')) return json({ configured: false, connections: [], providers: [] });
  if (url.pathname === '/api/runs') return json({ runs: [] });
  if (url.pathname === '/api/jobs') return json({ jobs: [] });
  return route.continue();
});
const finder = () => page.getByRole('dialog', { name: 'Find a column', exact: true });
const settings = () => page.getByRole('dialog', { name: 'Column settings', exact: true });
const option = () => settings().getByRole('checkbox', { name: checkboxName, exact: true });
async function openSettings() {
  await page.getByRole('button', { name: /^Columns / }).click();
  await finder().waitFor();
  await finder().getByLabel('Search columns', { exact: true }).fill(columnId);
  await finder().getByRole('button', { name: `Settings for ${columnTitle}`, exact: true }).click();
  await settings().waitFor();
  assert.equal(await settings().getByLabel('Column name', { exact: true }).inputValue(), columnTitle);
  assert.equal((await settings().locator('.column-editor-meta code').textContent()).trim(), columnId);
}
async function saveAndConfirm(expectedFlag) {
  const pending = page.waitForResponse((response) => response.url() === workspaceUrl && response.request().method() === 'PUT');
  await settings().getByRole('button', { name: 'Save settings', exact: true }).click();
  await settings().waitFor({ state: 'hidden' });
  const response = await pending;
  assert.equal(response.status(), 200, `Workspace save failed: ${await response.text()}`);
  await page.locator('.sync-state.sync-saved').waitFor();
  let latest;
  for (let attempt = 0; attempt < 20; attempt++) {
    latest = await readSnapshot();
    if (getColumn(latest).providerWaterfall.continueOnError === expectedFlag) break;
    await page.waitForTimeout(100);
  }
  assert.equal(getColumn(latest).providerWaterfall.continueOnError, expectedFlag, 'Actual database GET must confirm the saved flag.');
  assert.deepEqual(contentWithoutChangedFlag(latest), content(original), 'Database content outside the one flag must remain unchanged.');
  return latest;
}
try {
  original = await readSnapshot();
  assert.equal(original.schedule, undefined, 'This test requires the unscheduled disposable fixture.');
  const column = getColumn(original);
  assert.ok(column);
  assert.equal(column.title, columnTitle);
  assert.equal(column.recipe, 'http-waterfall');
  assert.equal(column.providerWaterfall.steps.length, 1);
  assert.equal(typeof column.providerWaterfall.continueOnError, 'boolean');
  originalFlag = column.providerWaterfall.continueOnError;

  await page.goto(`${origin}/?table=${tableId}`);
  await page.getByRole('button', { name: /^Columns / }).waitFor();
  await openSettings();
  assert.equal(await option().isChecked(), originalFlag);
  await option().setChecked(!originalFlag);
  const changed = await saveAndConfirm(!originalFlag);
  assert.ok(changed.revision > original.revision, 'Persisted change must increment the revision.');

  await page.reload();
  await page.getByRole('button', { name: /^Columns / }).waitFor();
  await openSettings();
  assert.equal(await option().isChecked(), !originalFlag, 'Reload and reopened UI must show the persisted changed flag.');
  await option().setChecked(originalFlag);
  const finalSnapshot = await saveAndConfirm(originalFlag);
  assert.deepEqual(content(finalSnapshot), content(original), 'Restored full sheet must match the original apart from revision and updatedAt.');
  restored = true;

  await page.reload();
  await page.getByRole('button', { name: /^Columns / }).waitFor();
  await openSettings();
  assert.equal(await option().isChecked(), originalFlag, 'Restored flag must also survive reload.');
  await settings().getByRole('button', { name: 'Cancel', exact: true }).click();
  await settings().waitFor({ state: 'hidden' });
  assert.equal(uiPuts.length, 2, 'Only the flag change and its restoration may save.');
  assert.deepEqual(blockedWrites, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedResponses, []);
  console.log(JSON.stringify({
    passed: true, tableId, columnId, originalFlag, restored,
    beforeRevision: original.revision, afterRevision: finalSnapshot.revision,
    databaseReads, actualWorkspacePuts: uiPuts.length, fallbackUsed,
    checks: ['Real UI toggle saves to local database', 'Reload and reopened settings show persisted changed flag', 'Real UI restores the original flag', 'Complete restored sheet content matches original excluding revision/updatedAt', 'Restored flag survives another reload', 'No enrichment, provider calls, other writes or browser errors'],
    blockedWrites, externalRequests, pageErrors: errors, consoleErrors, failedResponses,
  }));
} catch (error) {
  let recoveryError;
  // Stop the UI before fallback so no pending edit can overwrite the restoration.
  await page.close().catch(() => {});
  if (original && uiPuts.length) {
    try {
      const latest = await readSnapshot();
      if (getColumn(latest).providerWaterfall.continueOnError !== originalFlag) {
        fallbackUsed = true;
        const repaired = structuredClone(latest);
        getColumn(repaired).providerWaterfall.continueOnError = originalFlag;
        const response = await context.request.put(workspaceUrl, { data: { workspace: repaired, baseWorkspace: latest } });
        assert.equal(response.status(), 200, 'Fallback must restore only the original flag on the latest snapshot.');
      }
      const after = await readSnapshot();
      assert.equal(getColumn(after).providerWaterfall.continueOnError, originalFlag);
      restored = true;
    } catch (failure) {
      recoveryError = failure.message;
    }
  }
  console.error(JSON.stringify({ passed: false, error: error.message, tableId, columnId, originalFlag, restored, fallbackUsed, recoveryError, actualWorkspacePuts: uiPuts.length, blockedWrites, externalRequests, pageErrors: errors, consoleErrors, failedResponses }));
  throw error;
} finally {
  await browser.close();
}
