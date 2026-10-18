import { test, expect } from '@playwright/test';

const email = 'stage8-reset-qa@example.com';
const oldPassword = 'QaOriginal123!';
const newPassword = 'QaChanged123!';

test('password recovery uses a local mailbox and an isolated backend', async ({ page }) => {
  test.skip(process.env.QA_RESET_BACKEND !== '1', 'Requires the isolated reset QA backend');

  await page.route(/(?:\/auth\/email\/(?:request-reset|reset|login)|\/me)$/, async route => {
    const original = new URL(route.request().url());
    const response = await route.fetch({ url: `http://127.0.0.1:18001${original.pathname}` });
    await route.fulfill({ response });
  });

  await page.goto('/dashboard');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Забыли пароль?' }).click();
  await dialog.locator('#reset-email').fill(email);
  const requested = page.waitForResponse(response =>
    response.url().endsWith('/auth/email/request-reset')
  );
  await dialog.getByRole('button', { name: 'Отправить ссылку' }).click();
  expect((await requested).status()).toBe(200);

  await page.goto('http://127.0.0.1:8025/');
  const mail = page.locator('li').filter({ hasText: email }).first();
  await expect(mail).toBeVisible();
  await mail.locator('a').click();
  const resetLink = page.getByRole('link', { name: 'Открыть ссылку подтверждения' });
  const href = await resetLink.getAttribute('href');
  expect(href).toContain('/auth/reset#token=');
  await resetLink.click();
  await expect(page.getByRole('heading', { name: 'Сброс пароля' })).toBeVisible();
  await page.getByPlaceholder('Новый пароль').fill(newPassword);
  await page.getByPlaceholder('Подтвердите пароль').fill('WrongPass123!');
  await page.getByRole('button', { name: 'Изменить пароль' }).click();
  await expect(page.getByText('Пароли не совпадают')).toBeVisible();

  await page.getByPlaceholder('Подтвердите пароль').fill(newPassword);
  const resetResponse = page.waitForResponse(response =>
    response.url().endsWith('/auth/email/reset')
  );
  await page.getByRole('button', { name: 'Изменить пароль' }).click();
  expect((await resetResponse).status()).toBe(200);
  await expect(page.getByText('Пароль изменён. Теперь войдите в аккаунт.')).toBeVisible();

  const result = await page.evaluate(
    async ({ address, previous, next }) => {
      const login = async (password: string) => {
        const response = await fetch('/auth/email/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: address, password }),
        });
        return response.status;
      };
      return { oldStatus: await login(previous), newStatus: await login(next) };
    },
    { address: email, previous: oldPassword, next: newPassword }
  );
  expect(result).toEqual({ oldStatus: 401, newStatus: 200 });
});
