import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const ROUTES = ['/package', '/map', '/learn', '/ask', '/graph', '/pipeline'];

// Dark is the default theme; light is checked too because either can be chosen.
for (const theme of ['dark', 'light'] as const) {
  for (const route of ROUTES) {
    test(`${route} (${theme}) has no serious accessibility violations and no overflow`, async ({ page, expectNoOverflow }) => {
      await page.addInitScript((t) => window.localStorage.setItem('theme', t), theme);
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).exclude('.maplibregl-canvas').analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
      await expectNoOverflow();
    });
  }
}
