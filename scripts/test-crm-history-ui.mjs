// Read-only check of the completed synthetic dev-CRM batches. Never writes to CRM.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const origin = 'http://localhost:8798',
  out = 'outputs/nightshift/2026-09-07';
const { tableId } = JSON.parse(
  await readFile(out + '/crm-live-fixture.json', 'utf8'),
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  writes = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().endsWith('/api/crm-sync') && r.method() === 'POST')
    writes.push(r.url());
});
try {
  await page.goto(origin + '/?table=' + tableId);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Write to CRM', exact: true }).click();
  const history = page
    .locator('details')
    .filter({
      has: page.locator('summary', { hasText: 'Recent CRM batches' }),
    });
  await history.locator('summary').click();
  for (const provider of ['hubspot', 'salesforce']) {
    await history
      .getByRole('button', { name: new RegExp(provider + '.*complete') })
      .first()
      .click();
    const review = page.getByRole('region', {
      name: 'CRM changes to review',
      exact: true,
    });
    await review.getByText('CRM changes verified', { exact: true }).waitFor();
    assert.equal(
      await review
        .getByRole('columnheader', { name: 'Verified value', exact: true })
        .count(),
      1,
    );
    assert.equal(
      await review
        .getByRole('columnheader', { name: 'Before', exact: true })
        .count(),
      0,
    );
    assert.equal(
      await review
        .getByRole('button', { name: 'Confirm CRM write', exact: true })
        .count(),
      0,
    );
    assert.match(
      await review.locator('.crm-plan-counts').innerText(),
      /1\s+created/,
    );
    assert.match(
      await review.locator('.crm-change-record summary').innerText(),
      /Created.*verified/,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await review.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: out + '/crm-' + provider + '-verified-mobile.png',
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    checks: [
      'Both saved dev-CRM batches reopen',
      'Verified values have readable headings',
      'Completed actions use past tense',
      'Completed batches cannot repeat writes',
      'Mobile layouts reviewed',
    ],
    crmWrites: 0,
    pageErrors: errors,
  };
  await writeFile(
    out + '/crm-history-ui.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
