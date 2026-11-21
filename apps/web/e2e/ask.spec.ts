import { expect, test } from './fixtures';

// The API runs with E2E=1, so `x-ask-model: fake` swaps in a deterministic stand-in for
// the live model. Without the header, Ask has no model key and uses prepared answers.
const useFakeModel = (page: import('@playwright/test').Page) => page.setExtraHTTPHeaders({ 'x-ask-model': 'fake' });

async function ask(page: import('@playwright/test').Page, q: string) {
  await page.getByLabel('Your question').fill(q);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
}

test.describe('ask: conversation', () => {
  test('prepared mode says so', async ({ page }) => {
    await page.goto('/ask');
    await ask(page, 'Why do rural roads works packages get re-tendered?');
    await expect(page.getByTestId('ask-notice')).toContainText('showing a prepared answer', { timeout: 15_000 });
  });

  test('a follow-up continues the conversation', async ({ page }) => {
    await useFakeModel(page);
    await page.goto('/ask');
    await ask(page, 'Why are packages re-tendered?');
    await expect(page.getByTestId('answer').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Answered by fake')).toBeVisible();
    await expect(page).toHaveURL(/\/ask\?t=[a-z0-9]{10}$/);
    await ask(page, 'and what about delays?');
    await expect(page.getByTestId('answer')).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByTestId('asked')).toHaveText(['Why are packages re-tendered?', 'and what about delays?']);
  });

  test('reloading restores the conversation', async ({ page }) => {
    await useFakeModel(page);
    await page.goto('/ask');
    await ask(page, 'Why are packages re-tendered?');
    await expect(page.getByTestId('answer').first()).toBeVisible({ timeout: 15_000 });
    await ask(page, 'and what about delays?');
    await expect(page.getByTestId('answer')).toHaveCount(2, { timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId('asked')).toHaveText(['Why are packages re-tendered?', 'and what about delays?']);
    await expect(page.getByTestId('answer')).toHaveCount(2);
    await expect(page.getByLabel('Searching')).toHaveCount(0);
  });

  test('your package is cited and can be left out', async ({ page }) => {
    await useFakeModel(page);
    await page.goto('/ask');
    await expect(page.getByTestId('ask-package')).toContainText('Using:');
    await ask(page, 'Is my schedule realistic?');
    const answer = page.getByTestId('answer').first();
    await answer.getByRole('button', { name: /Your package/ }).click({ timeout: 15_000 });
    await expect(page.getByRole('dialog')).toContainText('Planned days from advertisement to contract signature');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: "Don't use it" }).click();
    await ask(page, 'and the re-tender risk?');
    await expect(page.getByTestId('answer')).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByTestId('answer').nth(1).getByRole('button', { name: /Your package/ })).toHaveCount(0);
  });

  test('a removed claim shows why', async ({ page }) => {
    await useFakeModel(page);
    await page.goto('/ask');
    await ask(page, 'Why are packages re-tendered?');
    await page.getByRole('button', { name: /sentences verified, 1 removed/ }).click({ timeout: 15_000 });
    await expect(page.getByTestId('grounding')).toContainText('Every package in the cohort finished early.');
    await expect(page.getByTestId('grounding')).toContainText('below threshold');
    await expect(page.getByTestId('answer')).not.toContainText('finished early');
  });

  test('new conversation starts over', async ({ page }) => {
    await useFakeModel(page);
    await page.goto('/ask');
    await ask(page, 'Why are packages re-tendered?');
    await expect(page.getByTestId('answer')).toHaveCount(1, { timeout: 15_000 });
    await page.getByRole('button', { name: 'New conversation' }).click();
    await expect(page.getByTestId('answer')).toHaveCount(0);
    await expect(page).toHaveURL(/\/ask$/);
  });

  test('new conversation after a reload stays new', async ({ page }) => {
    await useFakeModel(page);
    await page.goto('/ask');
    await ask(page, 'Why are packages re-tendered?');
    await expect(page.getByTestId('answer')).toHaveCount(1, { timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId('answer')).toHaveCount(1);
    await page.getByRole('button', { name: 'New conversation' }).click();
    await expect(page).toHaveURL(/\/ask$/);
    await page.waitForTimeout(1_000);
    await expect(page.getByTestId('answer')).toHaveCount(0);
    await expect(page).toHaveURL(/\/ask$/);
  });

  test('a follow-up waits for the conversation to load', async ({ page }) => {
    await useFakeModel(page);
    await page.goto('/ask');
    await ask(page, 'Why are packages re-tendered?');
    await expect(page.getByTestId('answer')).toHaveCount(1, { timeout: 15_000 });
    const url = page.url();
    // Slow down loading the conversation, as on a cold start.
    await page.route('**/api/v1/ask/threads/*', async (route) => {
      await new Promise((r) => setTimeout(r, 2_000));
      await route.continue();
    });
    await page.goto(url);
    await page.getByLabel('Your question').fill('and what about delays?');
    await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled();
    await expect(page.getByTestId('answer')).toHaveCount(1, { timeout: 10_000 });
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByTestId('answer')).toHaveCount(2, { timeout: 15_000 });
    await expect(page).toHaveURL(url);
  });
});
