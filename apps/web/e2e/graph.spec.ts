import { expect, test } from './fixtures';

test.describe('knowledge graph (live service)', () => {
  test('renders from the service with the Semantica badge', async ({ page }) => {
    await page.goto('/graph');
    await expect(page.getByTestId('graph-source')).toHaveText('Live · Semantica');
    await expect(page.getByRole('button', { name: 'Supplier: Meridian Roadworks Ltd' })).toBeVisible();
  });

  test('selecting a node shows its links and provenance', async ({ page }) => {
    await page.goto('/graph');
    await page.getByRole('button', { name: 'Contract: RW-ICB-03 Lot 2' }).click();
    const panel = page.getByTestId('node-panel');
    await expect(panel.getByText('RW-ICB-03 Lot 2', { exact: true })).toBeVisible();
    await expect(panel.getByTestId('provenance').locator('li').first()).toBeVisible();
    await expect(panel.getByText('awarded to')).toBeVisible();
    await page.getByRole('button', { name: 'Supplier: Meridian Roadworks Ltd' }).click();
    await expect(panel.getByText('“Meridian Rdwks (K) Ltd”')).toBeVisible();
  });

  test('refocuses by search', async ({ page }) => {
    await page.goto('/graph');
    await page.getByRole('button', { name: 'Find a node' }).click();
    await page.getByPlaceholder('Name, ID or type…').fill('P165530');
    await page.getByRole('option', { name: /P165530 Feeder Roads/ }).click();
    await expect(page).toHaveURL(/focus=P165530/);
    await expect(page.getByTestId('graph-focus')).toContainText('P165530 Feeder Roads');
  });

  test('most connected list refocuses the graph', async ({ page }) => {
    await page.goto('/graph');
    const items = page.getByTestId('most-connected').getByRole('button');
    await expect(items).toHaveCount(8);
    await items.first().click();
    await expect(page).toHaveURL(/focus=P171204/);
  });

  test('group by community recolours the graph', async ({ page }) => {
    await page.goto('/graph');
    await page.getByLabel('Group by community').click();
    await expect(page.getByText('Colour shows the community Semantica detected')).toBeVisible();
  });

  test('resolves typed supplier names', async ({ page }) => {
    await page.goto('/graph');
    await page.getByRole('tab', { name: 'Supplier name resolution' }).click();
    await page.getByLabel('Supplier names, one per line').fill('Meridian Roadworks Limited\nZebra Holdings');
    await page.getByRole('button', { name: 'Resolve' }).click();
    const results = page.getByTestId('resolve-results');
    await expect(results).toContainText('SUP-004417');
    await expect(results).toContainText('No match');
  });

  test('empty resolution shows a validation message', async ({ page }) => {
    await page.goto('/graph');
    await page.getByRole('tab', { name: 'Supplier name resolution' }).click();
    await page.getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByTestId('resolve-message')).toHaveText('Enter at least one supplier name, one per line.');
  });

  test('clusters keep joint ventures separate', async ({ page }) => {
    await page.goto('/graph');
    await page.getByRole('tab', { name: 'Supplier name resolution' }).click();
    const meridian = page.getByTestId('clusters').getByRole('row', { name: /SUP-004417/ });
    await expect(meridian).toContainText('MERIDIAN ROAD WORKS LIMITED');
    await expect(meridian.getByText('Meridian Roadworks Ltd / Tana Civil JV', { exact: true })).toHaveCount(0);
  });

  test('unknown focus shows a toast and returns to the closest precedent', async ({ page, consoleErrors }) => {
    await page.goto('/graph?focus=nope');
    await expect(page.getByText('Node not found')).toBeVisible();
    await expect(page).toHaveURL(/\/graph$/);
    await expect(page.getByTestId('graph-focus')).toContainText('RW-ICB-03 Lot 2');
    // The browser logs the 404 response itself; that is expected here.
    consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/404/.test(e)));
  });
});

test.describe('knowledge graph (service down)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'x-graph-simulate-down': '1' });
  });

  test('falls back to the snapshot and says so', async ({ page, consoleErrors }) => {
    await page.goto('/graph');
    await expect(page.getByTestId('graph-source')).toHaveText('Snapshot');
    await expect(page.getByRole('button', { name: 'Supplier: Meridian Roadworks Ltd' })).toBeVisible();
    await page.getByRole('tab', { name: 'Supplier name resolution' }).click();
    await page.getByLabel('Supplier names, one per line').fill('Meridian Roadworks Limited');
    await page.getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByTestId('resolve-message')).toHaveText('Supplier resolution needs the live graph service');
    consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/503/.test(e)));
  });

  test('pipeline shows the service as snapshot', async ({ page }) => {
    await page.goto('/pipeline');
    await expect(page.getByTestId('service-health').getByTestId('graph-source')).toHaveText('Snapshot');
  });
});

test('pipeline shows live service health', async ({ page }) => {
  await page.goto('/pipeline');
  const card = page.getByTestId('service-health');
  await expect(card.getByTestId('graph-source')).toHaveText('Live · Semantica');
  await expect(card).toContainText('53');
});
