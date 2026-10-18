import { test, expect } from '@playwright/test';

test.describe('Stage 8 browser smoke with isolated API responses', () => {
  test('registration document links open the React legal page', async ({ page }) => {
    await page.route('**/legal/documents/public-offer', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          doc_type: 'public_offer',
          slug: 'public-offer',
          version: 'test-1',
          status: 'published',
          title: 'Тестовая публичная оферта',
          body_markdown: 'Тестовый документ',
          content_sha256: '',
          published_at: '2026-10-10T00:00:00',
          archived_at: null,
        }),
      })
    );
    await page.goto('/legal/public-offer');
    await expect(page.getByRole('heading', { name: 'Тестовая публичная оферта' })).toBeVisible();
  });

  test('registration fits a 390 px viewport and selected date remains readable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Регистрация' }).click();
    await expect(
      page.getByRole('link', { name: /Войти через (Google|Яндекс|Mail\.ru)/ })
    ).toHaveCount(0);
    const date = page.locator('#register-date-of-birth');
    await date.fill('1990-10-10');
    const layout = await date.evaluate(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        inputFits: rect.left >= 0 && rect.right <= innerWidth,
        pageFits: document.documentElement.scrollWidth <= innerWidth,
        color: style.color,
        background: style.backgroundColor,
      };
    });
    expect(layout.inputFits).toBe(true);
    expect(layout.pageFits).toBe(true);
    expect(layout.color).toBe('rgb(230, 234, 242)');
    expect(layout.background).toBe('rgb(22, 28, 36)');
  });

  test('opening verification link does not consume it before confirmation', async ({ page }) => {
    page.on('pageerror', error => console.error('browser-page-error', error.message));
    let confirmations = 0;
    await page.route('**/auth/email/verify-preview', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ready', action: 'verify_email' }),
      })
    );
    await page.route('**/auth/email/verify', route => {
      confirmations += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Адрес подтверждён' }),
      });
    });
    await page.goto('/auth/verify#token=browser-smoke-token');
    const confirm = page.getByRole('button', { name: 'Подтвердить адрес' });
    await expect(confirm).toBeVisible();
    expect(confirmations).toBe(0);
    expect(page.url()).not.toContain('browser-smoke-token');
    await confirm.click();
    await expect(page.getByText('Адрес подтверждён. Теперь войдите в аккаунт.')).toBeVisible();
    expect(confirmations).toBe(1);
  });

  test('expired verification link cannot be confirmed', async ({ page }) => {
    page.on('pageerror', error => console.error('browser-page-error', error.message));
    await page.route('**/auth/email/verify-preview', route =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'expired' }),
      })
    );
    await page.goto('/auth/verify#token=expired-browser-token');
    await expect(
      page.getByText('Ссылка недействительна или срок её действия истёк.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Подтвердить адрес' })).toHaveCount(0);
  });

  test('other account recovery pages open directly', async ({ page }) => {
    await page.goto('/auth/verify-pending');
    await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible();
    await page.goto('/auth/two-factor');
    await expect(page.getByRole('heading', { name: 'Подтверждение входа' })).toBeVisible();
    await page.goto('/auth/reset#token=browser-reset-token');
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    expect(page.url()).not.toContain('browser-reset-token');
  });
});
