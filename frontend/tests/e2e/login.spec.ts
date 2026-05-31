import { test, expect } from '@playwright/test';

test.describe('/login', () => {
  test('opens auth dialog without development stub', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('в разработке')).toHaveCount(0);
    await expect(page.getByText('Открываем форму входа')).toBeVisible();

    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await expect(page.locator('button:has-text("Вход")').first()).toBeVisible();
    await expect(
      page.locator('input[placeholder*="Почта"], input[placeholder*="логин"]').first()
    ).toBeVisible();
  });
});
