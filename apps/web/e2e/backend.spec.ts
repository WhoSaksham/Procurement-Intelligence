import { expect, test } from './fixtures';

import { VIEWS } from '../components/shell/views';

const PIPELINE_KEY = VIEWS.find((v) => v.href === '/pipeline')!.key;

const unreachable = {
  status: 503,
  contentType: 'application/problem+json',
  body: JSON.stringify({ type: 'https://procurement.dev/problems/unreachable', title: 'Backend unreachable', status: 503, detail: 'down' }),
};

test('shows Backend unreachable when the API is down', async ({ page, consoleErrors }) => {
  await page.route('**/api/v1/**', (route) => route.fulfill(unreachable));
  await page.goto('/package');
  await expect(page.getByRole('heading', { name: 'Backend unreachable' })).toBeVisible({ timeout: 20_000 });
  // The rail (or its menu button on a phone) still works.
  await expect(page.getByRole('navigation', { name: 'Views' }).or(page.getByRole('button', { name: 'Open menu' })).first()).toBeVisible();
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/503/.test(e)));
});

test('recovers when the API comes back', async ({ page, consoleErrors }) => {
  await page.route('**/api/v1/**', (route) => route.fulfill(unreachable));
  await page.goto('/package');
  await expect(page.getByRole('heading', { name: 'Backend unreachable' })).toBeVisible({ timeout: 20_000 });
  await page.unroute('**/api/v1/**');
  // No reload: the app polls and comes back on its own.
  await expect(page.getByTestId('p50')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Backend unreachable' })).toBeHidden();
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/503/.test(e)));
});

test('an outage after load shows the banner, keeps the edit, and saves it when the API returns', async ({ page, request, newPackage, consoleErrors }) => {
  const id = await newPackage();
  await page.goto(`/package?pkg=${id}`);
  await expect(page.getByTestId('p50')).toBeVisible();
  await page.route('**/api/v1/**', (route) => route.fulfill(unreachable));
  await page.getByLabel('Your plan, days').fill('333');
  await expect(page.getByRole('heading', { name: 'Backend unreachable' })).toBeVisible({ timeout: 15_000 });
  await page.unroute('**/api/v1/**');
  await expect(page.getByTestId('p50')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Your plan, days')).toHaveValue('333');
  await expect.poll(async () => ((await (await request.get(`/api/v1/packages/${id}`)).json()) as { pkg: { plannedDays: number } }).pkg.plannedDays, { timeout: 15_000 }).toBe(333);
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/503/.test(e)));
});

test('opening a view during an outage shows the banner, not an endless placeholder', async ({ page, consoleErrors }) => {
  await page.goto('/package');
  await expect(page.getByTestId('p50')).toBeVisible();
  await page.route('**/api/v1/**', (route) => route.fulfill(unreachable));
  // Switch view inside the app (no page load), with the number-key shortcut.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(PIPELINE_KEY);
  await expect(page).toHaveURL(/\/pipeline$/);
  await expect(page.getByRole('heading', { name: 'Backend unreachable' })).toBeVisible({ timeout: 20_000 });
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/503/.test(e)));
});
