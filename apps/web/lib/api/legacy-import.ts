/** Where the app kept the scenario in browser storage before it had a backend. */
export const LEGACY_KEY = 'procurement-scenario-v1';

/**
 * Import a scenario saved in this browser by the earlier app as a new package,
 * once. The key is removed after a successful import (or if it isn't readable
 * JSON), and kept if the API couldn't be reached so the next visit tries again.
 */
export async function importLegacyScenario<T>(storage: Storage, importFn: (text: string) => Promise<T>): Promise<T | null> {
  let raw: string | null;
  try {
    raw = storage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    JSON.parse(raw);
  } catch {
    try {
      storage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
  try {
    const result = await importFn(raw);
    storage.removeItem(LEGACY_KEY);
    return result;
  } catch {
    return null;
  }
}
