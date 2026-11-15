import { expect, test, type Page } from './fixtures';

const num = async (page: Page, testId: string) => Number((await page.getByTestId(testId).textContent())?.replace(/[^\d.]/g, ''));

async function setEstimate(page: Page, value: string, phone: boolean) {
  if (phone) await page.getByRole('button', { name: 'Package details' }).click();
  await page.getByLabel('Estimate, US$ M').fill(value);
  if (phone) await page.getByRole('button', { name: 'Package details' }).click();
}

test('summary updates when the package changes', async ({ page }, info) => {
  await page.goto('/package');
  const p80 = await num(page, 'p80');
  await page.getByRole('tab', { name: 'Market approach' }).click();
  const national = page.getByTestId('method-row').filter({ hasText: 'RFB, open national' });
  await expect(national).toContainText('Above national limit');
  await setEstimate(page, '4', info.project.name === 'phone');
  await expect.poll(() => num(page, 'p80')).not.toBe(p80);
  await expect(national).not.toContainText('Above national limit');
});

test('use P80 sets the plan to the P80 estimate', async ({ page }) => {
  await page.goto('/package');
  const p80 = await num(page, 'p80');
  await page.getByRole('button', { name: /^Use \d+$/ }).click();
  await expect(page.getByLabel('Your plan, days')).toHaveValue(String(p80));
});

test('dragging the comparables strip changes the plan', async ({ page }) => {
  await page.goto('/package');
  const strip = page.getByRole('slider', { name: 'Planned days to signature' });
  const before = Number(await strip.getAttribute('aria-valuenow'));
  await strip.scrollIntoViewIfNeeded();
  const box = (await strip.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await strip.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  await expect(page.getByTestId('strip-read')).toContainText(`within ${await strip.getAttribute('aria-valuenow')} days`);
});

test('the comparables strip works from the keyboard', async ({ page }) => {
  await page.goto('/package');
  const strip = page.getByRole('slider', { name: 'Planned days to signature' });
  const before = Number(await strip.getAttribute('aria-valuenow'));
  await strip.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(strip).toHaveAttribute('aria-valuenow', String(before + 25));
});

test('applying fixes lowers re-tender risk', async ({ page }) => {
  await page.goto('/package');
  const before = await num(page, 'risk-rebid');
  await page.getByRole('button', { name: /^Apply \d+ fix/ }).click();
  await expect.poll(() => num(page, 'risk-rebid')).toBeLessThan(before);
  await expect(page.getByRole('button', { name: 'All in range' })).toBeDisabled();
});

test('sign-off goes stale after an edit', async ({ page }, info) => {
  await page.goto('/package');
  await page.getByRole('button', { name: 'Sign off this brief' }).click();
  await page.getByLabel('Your name').fill('A. Analyst');
  await page.getByRole('button', { name: 'Sign off', exact: true }).click();
  await expect(page.getByTestId('signoff')).toContainText('Signed off by A. Analyst');
  await setEstimate(page, '20', info.project.name === 'phone');
  await expect(page.getByTestId('signoff')).toContainText('Changed since A. Analyst signed off');
});

test('a contract added by the analyst is ranked and tagged', async ({ page }) => {
  await page.goto('/package');
  await page.getByRole('button', { name: 'Add your own contract' }).click();
  const form = page.getByRole('form', { name: 'Add your own contract' });
  await form.getByLabel('Contract title').fill('Bridge works, Lot 4');
  await form.getByLabel('Planned, %').fill('60');
  await form.getByLabel('Actual, %').fill('30');
  await form.getByLabel('Payment days').fill('80');
  await form.getByRole('button', { name: 'Add contract' }).click();
  const first = page.getByRole('option').first();
  await expect(first).toContainText('USR-01');
  await first.click();
  await expect(page.getByTestId('contract-signals')).toContainText('Your data');
});

test('every details tab renders', async ({ page }) => {
  await page.goto('/package');
  const tabs = page.getByRole('tab');
  const count = await tabs.count();
  expect(count).toBeGreaterThanOrEqual(9);
  for (let i = 0; i < count; i++) {
    await tabs.nth(i).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
  }
  await page.getByRole('tab', { name: 'Signature curve' }).click();
  await expect(page.getByRole('img', { name: /Share of comparable packages signed by day/ })).toBeVisible();
});

test('package sections are reachable by link', async ({ page }) => {
  await page.goto('/package#stage-execution');
  await expect(page.getByRole('heading', { name: 'Execution' })).toBeInViewport();
});

test('a saved scenario hydrates without warnings', async ({ page, seedScenario }, info) => {
  await seedScenario({ pkg: { value: 9, plannedDays: 222 } });
  await page.goto('/package');
  await expect(page.getByLabel('Your plan, days')).toHaveValue('222');
  if (info.project.name === 'phone') await page.getByRole('button', { name: 'Package details' }).click();
  await expect(page.getByLabel('Estimate, US$ M')).toHaveValue('9');
});
