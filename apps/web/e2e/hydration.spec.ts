import { expect, test } from './fixtures';

// Runs against `next dev` (npm run test:e2e:dev). The console fixture fails the
// test on any error, including React's hydration-mismatch report, which only
// development builds emit.
const ROUTES = ['/package', '/map', '/learn', '/ask', '/graph', '/pipeline'];

for (const route of ROUTES) {
  test(`${route} hydrates cleanly with a saved scenario`, async ({ page, seedScenario }) => {
    await seedScenario({ pkg: { value: 9.7, lots: 2, plannedDays: 150 }, criteria: { turnover: 21 } });
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState('networkidle');
    // Let React finish hydrating and report.
    await page.waitForTimeout(1500);
  });
}
