import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const STUBS = path.join(__dirname, 'stubs');
const png = readFileSync(path.join(STUBS, 'tile.png'));
const terrain = readFileSync(path.join(STUBS, 'terrarium-1000m.png'));

// Third-party tile and elevation hosts. Tests must never depend on them.
const EXTERNAL = [
  /tiles\.maps\.eox\.at/,
  /server\.arcgisonline\.com/,
  /services\.arcgisonline\.com/,
  /elevation-tiles-prod/,
  /tile\.openstreetmap\.org/,
  /router\.project-osrm\.org/,
  /demotiles\.maplibre\.org/,
];

export const STORAGE_KEY = 'procurement-scenario-v1';

type Fixtures = {
  consoleErrors: string[];
  seedScenario: (partial: Record<string, unknown>) => Promise<void>;
  expectNoOverflow: () => Promise<void>;
};

export const test = base.extend<Fixtures>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        const text = m.text();
        if (m.type() === 'error' || /hydrat/i.test(text)) errors.push(`${m.type()}: ${text.slice(0, 300)}`);
      });
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (!EXTERNAL.some((r) => r.test(url))) return route.fallback();
        if (/elevation-tiles-prod/.test(url)) return route.fulfill({ body: terrain, contentType: 'image/png' });
        return route.fulfill({ body: png, contentType: 'image/png' });
      });
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
  seedScenario: async ({ page }, use) => {
    await use(async (partial) => {
      await page.addInitScript(
        ([key, value]) => window.localStorage.setItem(key, value),
        [STORAGE_KEY, JSON.stringify(partial)],
      );
    });
  },
  expectNoOverflow: async ({ page }, use) => {
    await use(async () => {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, 'horizontal overflow (px)').toBeLessThanOrEqual(0);
    });
  },
});

export { expect };
export type { Page };
