// Explicit opt-in only: creates/updates one synthetic company in each connected dev CRM.
// Native IDs, returned custom fields, and plans are stored only in ignored outputs/.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
if (process.env.POMADE_ALLOW_DEV_CRM_WRITES !== '1')
  throw new Error(
    'Set POMADE_ALLOW_DEV_CRM_WRITES=1 only for the authorized dev CRM test.',
  );
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
const crmName = 'Pomade Night shift QA — 2026-09-07',
  domain = 'pomade-nightshift-20260907.example.test';
const results = [];
try {
  let fixture;
  try {
    fixture = JSON.parse(
      await readFile(out + '/crm-live-fixture.json', 'utf8'),
    );
  } catch {}
  if (!fixture) {
    const existing = (await api('/api/tables')).tables.find(
      (t) => t.name === 'Night shift QA CRM round trip',
    );
    if (existing) fixture = { tableId: existing.id };
  }
  if (!fixture) {
    const r = await page.request.post(origin + '/api/tables', {
      data: { name: 'Night shift QA CRM round trip', mode: 'empty' },
    });
    assert.equal(r.status(), 201);
    fixture = { tableId: (await r.json()).table.id };
  }
  await writeFile(out + '/crm-live-fixture.json', JSON.stringify(fixture));
  const path = '/api/workspace?workspaceId=' + fixture.tableId;
  let workspace = (await api(path)).workspace;
  assert.match(workspace.name, /^Night shift QA/);
  if (!workspace.rows.length) {
    const column = (id, title) => ({ id, title, kind: 'text', width: 200 });
    const next = {
      ...workspace,
      columns: [
        column('company', 'Company'),
        column('domain', 'Domain'),
        column('website', 'Website'),
        column('description', 'Description'),
        column('score', 'ICP score'),
        column('tier', 'Priority tier'),
        column('tags', 'Signal tags'),
        { id: 'status', title: 'Run status', kind: 'status', width: 140 },
      ],
      rows: [
        {
          id: 'qa-crm-roundtrip',
          values: {
            company: crmName,
            domain,
            website: 'https://' + domain,
            description:
              'Disposable Pomade integration test. No outreach. Created during the authorized September 7 night shift.',
            score: '88',
            tier: 'High',
            tags: 'Night shift QA;Browser verified',
            status: 'Ready',
          },
        },
      ],
      updatedAt: Date.now(),
    };
    const r = await page.request.put(origin + path, {
      data: { workspace: next, baseWorkspace: workspace },
    });
    assert.equal(r.status(), 200);
    workspace = (await r.json()).workspace;
  }
  assert.equal(workspace.rows.length, 1);
  assert.equal(workspace.rows[0].values.company, crmName);
  assert.equal(workspace.rows[0].values.domain, domain);
  await page.goto(origin + '/?table=' + fixture.tableId);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Write to CRM', exact: true }).click();
  for (const provider of ['hubspot', 'salesforce']) {
    const objectType = provider === 'hubspot' ? 'company' : 'account';
    await page.getByLabel('CRM', { exact: true }).selectOption(provider);
    if (
      (await page.getByLabel('Object', { exact: true }).inputValue()) !==
      objectType
    )
      await page.getByLabel('Object', { exact: true }).selectOption(objectType);
    const names =
      provider === 'hubspot'
        ? {
            name: 'name',
            website: 'website',
            description: 'description',
            score: 'pomade_icp_score',
            tier: 'pomade_priority_tier',
            tags: 'pomade_signal_tags',
          }
        : {
            name: 'Name',
            website: 'Website',
            description: 'Description',
            score: 'Pomade_ICP_Score__c',
            tier: 'Pomade_Priority_Tier__c',
            tags: 'Pomade_Signal_Tags__c',
          };
    await page
      .getByLabel('Map ' + names.name, { exact: true })
      .selectOption('company');
    await page
      .getByLabel('Map ' + names.website, { exact: true })
      .selectOption(provider === 'hubspot' ? '' : 'website');
    await page
      .getByLabel('Map ' + names.description, { exact: true })
      .selectOption('description');
    if (provider === 'hubspot')
      await page
        .getByLabel('Map domain', { exact: true })
        .selectOption('domain');
    for (const key of ['score', 'tier', 'tags']) {
      const map = page.getByLabel('Map ' + names[key], { exact: true });
      if (!(await map.count())) {
        await page
          .getByLabel('Search CRM properties', { exact: true })
          .fill('Pomade');
        await page
          .getByLabel('Add a CRM property or custom field', { exact: true })
          .selectOption(names[key]);
      }
      await map.selectOption(key);
    }
    const saveDetails = page.locator('.crm-save-mapping');
    if ((await saveDetails.getAttribute('open')) === null)
      await saveDetails.locator('summary').click();
    await page
      .getByLabel('Mapping name', { exact: true })
      .fill('Night shift QA ' + provider);
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes('/api/workspace?') && r.request().method() === 'PUT',
    );
    await saveDetails.getByRole('button', { name: /^Save mapping/ }).click();
    assert.equal((await saved).status(), 200);
    const previewResponse = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === '/api/crm-sync' &&
        r.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Preview CRM changes', exact: true })
      .click();
    const previewHttp = await previewResponse;
    assert.equal(previewHttp.status(), 200);
    const preview = (await previewHttp.json()).plan;
    await writeFile(
      out + `/crm-${provider}-preview.json`,
      JSON.stringify(preview, null, 2),
    );
    assert.equal(preview.actions.length, 1);
    assert.ok(
      ['create', 'update', 'unchanged'].includes(preview.actions[0].action),
      preview.actions[0].message,
    );
    const previousName = preview.actions[0].before[names.name];
    assert.ok(
      !previousName || previousName === crmName,
      'Never modify another record',
    );
    assert.equal(preview.actions[0].properties[names.name], crmName);
    await page.getByRole('region', { name: 'CRM changes to review' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole('button', { name: 'Confirm CRM write', exact: true })
      .scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running'),
    );
    const bounds = await page.getByRole('dialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.screenshot({
      path: out + `/crm-${provider}-preview-mobile.png`,
      animations: 'disabled',
    });
    const committed = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === '/api/crm-sync' &&
        r.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Confirm CRM write', exact: true })
      .click();
    const commitHttp = await committed;
    assert.equal(commitHttp.status(), 200);
    const complete = (await commitHttp.json()).plan;
    await writeFile(
      out + `/crm-${provider}-complete.json`,
      JSON.stringify(complete, null, 2),
    );
    assert.equal(complete.status, 'complete', complete.actions[0].message);
    const action = complete.actions[0];
    assert.equal(action.status, 'verified');
    assert.ok(action.nativeId);
    assert.equal(action.observed[names.score], '88');
    assert.equal(action.observed[names.tier], 'High');
    const idSaved = page.waitForResponse(
      (r) =>
        r.url().includes('/api/workspace?') && r.request().method() === 'PUT',
    );
    await page
      .getByRole('button', { name: 'Copy verified IDs to table', exact: true })
      .click();
    assert.equal((await idSaved).status(), 200);
    const stored = (await api(path)).workspace;
    assert.equal(
      stored.rows[0].values[`crm_${provider}_${objectType}_id`],
      action.nativeId,
    );
    const read = await page.request.post(origin + '/api/providers/crm', {
      data: {
        provider,
        objectType,
        recordIds: [action.nativeId],
        fields: [names.score, names.tier, names.tags],
        limit: 1,
      },
    });
    assert.equal(read.status(), 200);
    const returned = (await read.json()).preview;
    await writeFile(
      out + `/crm-${provider}-readback.json`,
      JSON.stringify(returned, null, 2),
    );
    assert.equal(returned.contacts.length, 1);
    assert.equal(returned.contacts[0].nativeId, action.nativeId);
    assert.equal(returned.contacts[0].company, crmName);
    assert.equal(returned.contacts[0].properties[names.score], '88');
    results.push({
      provider,
      objectType,
      status: complete.status,
      action: action.action,
      customFieldsReadBack: true,
      verifiedIdSaved: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    tableId: fixture.tableId,
    records: results,
    pageErrors: errors,
  };
  await writeFile(out + '/crm-live-ui.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page
    .screenshot({ path: out + '/crm-live-failure.png', animations: 'disabled' })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
