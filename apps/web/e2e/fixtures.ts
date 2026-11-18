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

/** Where the app kept the scenario before it had a backend; such saves are imported once. */
export const LEGACY_KEY = 'procurement-scenario-v1';

type Change = { name?: string; pkg?: Record<string, unknown>; criteria?: Record<string, unknown> };

type Fixtures = {
  consoleErrors: string[];
  /** Create a package through the API (deleted after the test); returns its id. Open it with `?pkg=<id>`. */
  newPackage: (change?: Change) => Promise<string>;
  /** Put an old-style browser save in storage before the page loads. */
  seedLegacySave: (partial: Record<string, unknown>) => Promise<void>;
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
  newPackage: async ({ request }, use) => {
    const created: string[] = [];
    await use(async ({ name, pkg, criteria } = {}) => {
      const res = await request.post('/api/v1/packages', { data: name ? { name } : {} });
      expect(res.status(), await res.text()).toBe(201);
      const { id } = (await res.json()) as { id: string };
      created.push(id);
      if (pkg || criteria) {
        const patched = await request.patch(`/api/v1/packages/${id}`, { data: { version: 1, pkg, criteria } });
        expect(patched.status(), await patched.text()).toBe(200);
      }
      return id;
    });
    for (const id of created) await request.delete(`/api/v1/packages/${id}`);
  },
  seedLegacySave: async ({ page }, use) => {
    await use(async (partial) => {
      // Only on the first load: a reload must not plant the save again.
      await page.addInitScript(
        ([key, value]) => {
          if (sessionStorage.getItem('legacy-planted')) return;
          sessionStorage.setItem('legacy-planted', '1');
          window.localStorage.setItem(key, value);
        },
        [LEGACY_KEY, JSON.stringify(partial)],
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
