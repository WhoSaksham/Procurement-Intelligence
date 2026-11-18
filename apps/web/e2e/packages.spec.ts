import type { APIRequestContext } from '@playwright/test';
import { expect, LEGACY_KEY, test, type Page } from './fixtures';

const CURRENT_KEY = 'procurement-current-package';
const isPhone = (name: string) => name === 'phone';

async function packageFields(page: Page, phone: boolean, fn: () => Promise<void>) {
  if (phone) await page.getByRole('button', { name: 'Package details' }).click();
  await fn();
  if (phone) await page.getByRole('button', { name: 'Package details' }).click();
}

const currentId = (page: Page) => page.evaluate((k) => localStorage.getItem(k), CURRENT_KEY);

async function savedPackage(request: APIRequestContext, id: string) {
  const res = await request.get(`/api/v1/packages/${id}`);
  return (await res.json()) as { version: number; example: boolean; pkg: { value: number; lots: number; plannedDays: number; name: string } };
}

test('editing the example saves a copy and leaves the example as it is', async ({ page, request }, info) => {
  await page.goto('/package');
  await expect(page.getByRole('button', { name: /switch package/ })).toContainText('Example');
  await packageFields(page, isPhone(info.project.name), () => page.getByLabel('Estimate, US$ M').fill('9'));
  await expect(page.getByText('Saved as your own copy')).toBeVisible();
  await expect.poll(() => currentId(page)).not.toBe('example');
  const copy = (await currentId(page))!;
  try {
    await expect.poll(async () => (await savedPackage(request, copy)).pkg.value).toBe(9);
    expect((await savedPackage(request, 'example')).pkg.value).toBe(18.4);
    await page.goto('/package?pkg=example');
    await packageFields(page, isPhone(info.project.name), () => expect(page.getByLabel('Estimate, US$ M')).toHaveValue('18.4'));
  } finally {
    await request.delete(`/api/v1/packages/${copy}`);
  }
});

test('edits persist across reload', async ({ page, request, newPackage }) => {
  const id = await newPackage({ name: 'Persist me' });
  await page.goto(`/package?pkg=${id}`);
  await page.getByLabel('Your plan, days').fill('300');
  await expect.poll(async () => (await savedPackage(request, id)).pkg.plannedDays).toBe(300);
  await page.reload();
  await expect(page.getByLabel('Your plan, days')).toHaveValue('300');
});

test('clearing the package name to retype it never reverts or errors', async ({ page, request, newPackage }) => {
  const id = await newPackage({ name: 'Before' });
  await page.goto(`/package?pkg=${id}`);
  const name = page.getByLabel('Package name');
  await name.fill('');
  await page.waitForTimeout(500);
  await expect(name).toHaveValue('');
  await expect(page.getByText('The request did not pass validation')).toHaveCount(0);
  await name.pressSequentially('After');
  await expect(name).toHaveValue('After');
  await expect.poll(async () => (await savedPackage(request, id)).pkg.name).toBe('After');
});

test('dragging the plan line updates the on-time figure from the server', async ({ page, newPackage }) => {
  const id = await newPackage();
  await page.goto(`/package?pkg=${id}`);
  const onTime = page.getByTestId('on-time');
  const before = await onTime.textContent();
  const strip = page.getByRole('slider', { name: 'Planned days to signature' });
  await strip.scrollIntoViewIfNeeded();
  const box = (await strip.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(onTime).not.toHaveText(before ?? '');
});

test('the switcher creates, duplicates and deletes packages', async ({ page, request }) => {
  await page.goto('/package');
  const switcher = page.getByRole('button', { name: /switch package/ });
  await switcher.click();
  await page.getByRole('button', { name: 'New package' }).click();
  await expect(switcher).not.toContainText('Example');
  const created = (await currentId(page))!;
  try {
    await switcher.click();
    await page.getByRole('button', { name: 'Duplicate this package' }).click();
    await expect.poll(() => currentId(page)).not.toBe(created);
    const duplicate = (await currentId(page))!;
    expect((await savedPackage(request, duplicate)).pkg.name).toMatch(/\(copy\)$/);

    await switcher.click();
    await page.getByRole('button', { name: 'Delete this package' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Package deleted')).toBeVisible();
    await expect(switcher).toContainText('Example');
    expect((await request.get(`/api/v1/packages/${duplicate}`)).status()).toBe(404);
  } finally {
    await request.delete(`/api/v1/packages/${created}`);
  }
});

test('a deleted package falls back to the example', async ({ page, request, newPackage, consoleErrors }) => {
  const id = await newPackage();
  await request.delete(`/api/v1/packages/${id}`);
  await page.goto(`/package?pkg=${id}`);
  await expect(page.getByText('That package no longer exists — showing the example')).toBeVisible();
  await expect(page.getByRole('button', { name: /switch package/ })).toContainText('Example');
  // The browser logs the 404 response itself; that is expected here.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/404/.test(e)));
});

test('two tabs: a stale tab re-applies its edit on top of the newer version', async ({ page, context, request, newPackage, consoleErrors }, info) => {
  const id = await newPackage();
  const other = await context.newPage();
  await page.goto(`/package?pkg=${id}`);
  await other.goto(`/package?pkg=${id}`);
  await expect(other.getByLabel('Your plan, days')).toHaveValue('120');

  await packageFields(page, isPhone(info.project.name), () => page.getByLabel('Estimate, US$ M').fill('7'));
  await expect.poll(async () => (await savedPackage(request, id)).pkg.value).toBe(7);

  // The other tab still holds version 1.
  await other.getByLabel('Your plan, days').fill('250');
  await expect(other.getByText('Updated elsewhere — your change was re-applied')).toBeVisible();
  await expect.poll(async () => (await savedPackage(request, id)).pkg).toMatchObject({ value: 7, plannedDays: 250 });
  await other.close();
  // The browser logs the 409 response itself; that is expected here.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/409/.test(e)));
});

test('a scenario saved in this browser by the old app is imported once', async ({ page, request, seedLegacySave }, info) => {
  const name = `Old browser save ${info.project.name} ${Date.now()}`;
  const named = async () => ((await (await request.get('/api/v1/packages')).json()) as { items: { name: string }[] }).items.filter((i) => i.name === name).length;
  await seedLegacySave({ pkg: { name, value: 11 } });
  await page.goto('/package');
  await expect(page.getByText(`Your saved scenario was imported as “${name}”`)).toBeVisible();
  const id = (await currentId(page))!;
  try {
    expect(id).not.toBe('example');
    await packageFields(page, isPhone(info.project.name), () => expect(page.getByLabel('Estimate, US$ M')).toHaveValue('11'));
    expect(await page.evaluate((k) => localStorage.getItem(k), LEGACY_KEY)).toBeNull();
    expect(await named()).toBe(1);
    await page.reload();
    await expect(page.getByLabel('Your plan, days')).toBeVisible();
    expect(await named()).toBe(1);
    expect(await currentId(page)).toBe(id);
  } finally {
    await request.delete(`/api/v1/packages/${id}`);
  }
});
