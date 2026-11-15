import { expect, test } from './fixtures';

// Map tiles, terrain and elevation are served from local stubs (see fixtures.ts).
test.describe('site map', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/map');
    await expect(page.locator('[data-testid="map-stage"][data-ready="true"]')).toBeVisible({ timeout: 20_000 });
  });

  test('mounts the map on Sentinel-2 imagery', async ({ page }) => {
    await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Kitui–Mwingi');
  });

  test('compare shows two maps and a swipe handle', async ({ page }) => {
    await page.getByRole('button', { name: 'Compare' }).click();
    await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(2);
    const handle = page.getByRole('slider', { name: 'Compare position' });
    await expect(handle).toBeVisible();
    await handle.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(handle).toHaveAttribute('aria-valuenow', '57');
  });

  test('selecting a segment shows its detail and opens a close view', async ({ page }) => {
    await page.getByTestId('segment-0').getByRole('button').first().click();
    const detail = page.getByTestId('segment-0');
    await expect(detail).toContainText('Bare-soil change');
    await detail.getByRole('button', { name: 'Close view' }).click();
    await expect(page.getByRole('button', { name: 'High-res' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('elevation profile reads the (flat) stub terrain', async ({ page }) => {
    const profile = page.getByTestId('profile');
    await expect(profile.getByRole('img', { name: /Elevation profile/ })).toBeVisible({ timeout: 20_000 });
    await expect(profile).toContainText('steepest 0.0%');
  });

  test('drive the road shows controls and exits', async ({ page }) => {
    await page.getByRole('button', { name: 'Drive the road' }).click();
    const hud = page.getByTestId('drive-hud');
    await expect(hud).toBeVisible();
    await hud.getByRole('button', { name: 'Exit' }).click();
    await expect(hud).toBeHidden();
  });
});

test('a contract deep link opens that road', async ({ page }) => {
  await page.goto('/map?contract=RRA-W-08');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Wote');
});
