import { test, expect } from '@playwright/test';

test('Login, marketplace, analytics, editor', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'testuser@example.com');
  await page.fill('input[name="password"]', 'testpass');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/templates|dashboard/);

  await page.goto('/templates');
  await expect(page.locator('.font-bold')).toContainText('Маркетплейс');
  await expect(page.locator('.grid')).toBeVisible();

  await page.goto('/analytics');
  await expect(page.locator('h1')).toContainText('Аналитика');

  await page.goto('/edit-template/1');
  await expect(page.locator('h1')).toContainText('Редактор шаблона');
}); 