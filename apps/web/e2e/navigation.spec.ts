import { expect, test } from './fixtures';

const VIEWS = [
  { href: '/package', name: 'Package', key: '1' },
  { href: '/map', name: 'Site map', key: '2' },
  { href: '/learn', name: 'Learn', key: '3' },
  { href: '/ask', name: 'Ask the evidence', key: '4' },
  { href: '/graph', name: 'Knowledge graph', key: '5' },
  { href: '/pipeline', name: 'Data pipeline', key: '6' },
];

test('root redirects to the package page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/package$/);
});

test('rail links reach every route', async ({ page }, info) => {
  await page.goto('/package');
  for (const v of VIEWS) {
    if (info.project.name === 'phone') await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: v.name }).click();
    await expect(page).toHaveURL(new RegExp(`${v.href}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

test('number keys navigate unless typing', async ({ page }) => {
  await page.goto('/package');
  await page.locator('body').press('3');
  await expect(page).toHaveURL(/\/learn$/);
  await page.locator('body').press('6');
  await expect(page).toHaveURL(/\/pipeline$/);
  await page.locator('body').press('1');
  await expect(page).toHaveURL(/\/package$/);
  const field = page.getByRole('textbox').first();
  await field.focus();
  await page.keyboard.press('2');
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/\/package$/);
});

test('dark is the default theme; light can be chosen and persists', async ({ page }, info) => {
  await page.goto('/package');
  await expect(page.locator('html')).toHaveClass(/dark/);
  if (info.project.name === 'phone') await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: /light theme/i }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('number keys do not navigate from an open menu or dialog', async ({ page }) => {
  await page.goto('/graph');
  await page.getByRole('combobox', { name: 'Hops' }).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('3');
  // Give a (wrong) client-side navigation time to happen before asserting it did not.
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/\/graph$/);
  await page.keyboard.press('Escape');
  await page.goto('/package');
  await page.getByRole('button', { name: /^Source \d+:/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('3');
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/\/package$/);
});

test('number keys do not navigate from a focused dropdown', async ({ page }) => {
  await page.goto('/graph');
  await page.getByRole('combobox', { name: 'Hops' }).focus();
  await page.keyboard.press('3');
  // Give a (wrong) client-side navigation time to happen before asserting it did not.
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/\/graph$/);
});
