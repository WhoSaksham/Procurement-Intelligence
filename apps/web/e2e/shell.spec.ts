import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const p50 = async (page: Page) => Number((await page.getByTestId('p50').textContent())?.replace(/\D/g, ''));

async function openMore(page: Page, isPhone: boolean) {
  if (isPhone) await page.getByRole('button', { name: 'Package details' }).click();
}

test('palette opens with the keyboard and navigates', async ({ page }) => {
  await page.goto('/package');
  await page.locator('body').press(`${mod}+k`);
  const dialog = page.getByRole('dialog', { name: 'Command menu' });
  await expect(dialog).toBeVisible();
  await page.keyboard.type('learn');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/learn$/);
  await expect(dialog).toBeHidden();
  await page.locator('body').press('/');
  await expect(dialog).toBeVisible();
});

test('palette falls through to asking the evidence', async ({ page }) => {
  await page.goto('/package');
  await page.locator('body').press(`${mod}+k`);
  await page.keyboard.type('why re-tender');
  await page.getByRole('option', { name: /Ask the evidence: “why re-tender”/ }).click();
  await expect(page).toHaveURL(/\/ask\?q=why(\+|%20)re-tender$/);
});

test('a custom country changes the forecast', async ({ page }, info) => {
  await page.goto('/package');
  const before = await p50(page);
  await openMore(page, info.project.name === 'phone');
  await page.getByRole('combobox', { name: 'Country' }).click();
  await page.getByRole('option', { name: 'Add a country…' }).click();
  const form = page.getByRole('form', { name: 'Add a country' });
  await form.getByLabel('Name').fill('Atlantis');
  await form.getByLabel('CPIA public sector mgmt (1–6)').fill('2.5');
  await form.getByLabel('WGI regulatory quality, percentile').fill('10');
  await form.getByLabel('Fragile or conflict-affected').check();
  await form.getByRole('button', { name: 'Add and use' }).click();
  await expect(page.getByRole('combobox', { name: 'Country' })).toHaveText(/Atlantis/);
  await expect.poll(() => p50(page)).toBeGreaterThan(before);
});

test('importing a malformed file shows an error and keeps the scenario', async ({ page, consoleErrors }, info) => {
  await page.goto('/package');
  const before = await p50(page);
  if (info.project.name === 'phone') await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByTestId('import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(page.getByText('bad.json is not a scenario file')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await p50(page)).toBe(before);
  // The API rejects the file with a 400, which the browser logs; that is expected here.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/400/.test(e)));
});

test('export, reset and import round-trip the scenario', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.goto('/package');
  await openMore(page, phone);
  const estimate = page.getByLabel('Estimate, US$ M');
  await estimate.fill('9');
  await expect(estimate).toHaveValue('9');
  if (phone) await page.keyboard.press('Escape');

  const menu = async () => phone && (await page.getByRole('button', { name: 'Open menu' }).click());
  await menu();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const file = await (await download).path();
  const exported = readFileSync(file!, 'utf8');
  expect(JSON.parse(exported).pkg.value).toBe(9);

  await page.getByRole('button', { name: 'Reset' }).click();
  if (phone) await page.keyboard.press('Escape');
  await openMore(page, phone);
  await expect(page.getByLabel('Estimate, US$ M')).toHaveValue('18.4');
  if (phone) await page.keyboard.press('Escape');

  await menu();
  await page.getByTestId('import-file').setInputFiles({ name: 'scenario.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await expect(page.getByText('Loaded scenario.json')).toBeVisible();
  if (phone) await page.keyboard.press('Escape');
  await openMore(page, phone);
  await expect(page.getByLabel('Estimate, US$ M')).toHaveValue('9');
});

test('a citation chip opens its source passage', async ({ page }) => {
  await page.goto('/package');
  await page.getByRole('button', { name: /^Source \d+: Major Contract Awards/ }).first().click();
  const sheet = page.getByRole('dialog', { name: /Comparable cohort/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('mark')).toContainText('median 168 days');
});

test('a saved package loads without hydration warnings', async ({ page, newPackage }, info) => {
  const id = await newPackage({ pkg: { value: 9 } });
  await page.goto(`/package?pkg=${id}`);
  await openMore(page, info.project.name === 'phone');
  await expect(page.getByLabel('Estimate, US$ M')).toHaveValue('9');
});
