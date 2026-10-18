import { test, expect, type Page } from '@playwright/test';

async function useIsolatedApi(page: Page) {
  await page.route('http://127.0.0.1:5173/**', async route => {
    const url = new URL(route.request().url());
    if (
      !/^(\/auth\/email\/|\/legal\/documents(?:\/|$)|\/me(?:\/|$)|\/api\/user\/|\/privacy\/|\/chat\/)/.test(
        url.pathname
      )
    ) {
      await route.continue();
      return;
    }
    const response = await route.fetch({
      url: `http://127.0.0.1:18001${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
}

test('identity registration, local email and profile use the isolated backend', async ({
  page,
}) => {
  test.skip(process.env.QA_IDENTITY_BACKEND !== '1', 'Requires isolated Stage 8 identity QA API');
  const email = `identity-${Date.now()}@example.com`;
  const username = `QaNick_${Date.now()}`;
  const password = 'QaOriginal123!';

  await useIsolatedApi(page);

  await page.goto('/dashboard');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Регистрация' }).click();
  await dialog.getByPlaceholder('Почта', { exact: true }).fill(email);
  await dialog.getByPlaceholder('Отображаемое имя').fill('Тестовый автор');
  await dialog.locator('#register-username').fill(username);
  await expect(dialog.locator('#register-username-status')).toContainText('Ник свободен');
  await dialog.locator('#register-date-of-birth').fill('1990-10-09');
  await dialog.getByLabel('Пароль для регистрации').fill(password);
  await dialog.getByPlaceholder('Повтор пароля').fill(password);
  await dialog.getByRole('button', { name: 'Показать пароль' }).click();
  await expect(dialog.getByLabel('Пароль для регистрации')).toHaveAttribute('type', 'text');
  await dialog.getByRole('button', { name: 'Скрыть пароль' }).click();
  await expect(dialog.getByLabel('Пароль для регистрации')).toHaveAttribute('type', 'password');
  await dialog.getByRole('checkbox', { name: /Публичную оферту/ }).check();
  await dialog.getByRole('checkbox', { name: /Политикой обработки/ }).check();
  await dialog.getByRole('checkbox', { name: /Согласие на обработку/ }).check();
  const registration = page.waitForResponse(response =>
    response.url().endsWith('/auth/email/register')
  );
  await dialog.getByRole('button', { name: 'Зарегистрироваться' }).click();
  const registrationResponse = await registration;
  if (registrationResponse.status() !== 200) {
    const result = await registrationResponse.json();
    const fields = Array.isArray(result.detail)
      ? result.detail.map((item: { loc: string[]; type: string }) => ({
          loc: item.loc,
          type: item.type,
        }))
      : [];
    throw new Error(
      `Registration HTTP ${registrationResponse.status()}; validation fields: ${JSON.stringify(fields)}`
    );
  }

  await page.goto('http://127.0.0.1:8025/');
  const mail = page.locator('li').filter({ hasText: email }).first();
  await expect
    .poll(
      async () => {
        await page.reload();
        return mail.count();
      },
      { timeout: 15000 }
    )
    .toBeGreaterThan(0);
  await expect(mail).toBeVisible();
  await mail.locator('a').click();
  await page.getByRole('link', { name: 'Открыть ссылку подтверждения' }).click();
  await expect(page.getByRole('button', { name: 'Подтвердить адрес' })).toBeVisible();
  await page.getByRole('button', { name: 'Подтвердить адрес' }).click();
  await expect(page.getByText('Адрес подтверждён. Теперь войдите в аккаунт.')).toBeVisible();

  await page.goto('/dashboard');
  await dialog.getByPlaceholder('Электронная почта').fill(email);
  await dialog.getByPlaceholder('Пароль', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/dashboard/settings?tab=profile');
  await expect(page.getByText(`@${username}`)).toBeVisible();
  await expect(page.getByText('Ник выбран окончательно и не меняется.')).toBeVisible();
  const me = await page.evaluate(async () => {
    const token = localStorage.getItem('auth_token');
    return (await fetch('/me', { headers: { Authorization: `Bearer ${token}` } })).status;
  });
  expect(me).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('existing email has a neutral registration response and no second local letter', async ({
  page,
  context,
}) => {
  test.skip(process.env.QA_IDENTITY_BACKEND !== '1', 'Requires isolated Stage 8 identity QA API');
  const mailbox = await context.newPage();
  await mailbox.goto('http://127.0.0.1:8025/');
  const before = await mailbox.locator('li').count();
  await useIsolatedApi(page);
  await page.goto('/dashboard');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Регистрация' }).click();
  await dialog.getByPlaceholder('Почта', { exact: true }).fill('qa-owner@example.com');
  await dialog.getByPlaceholder('Отображаемое имя').fill('Другой пользователь');
  await dialog.locator('#register-username').fill(`Other_${Date.now()}`);
  await dialog.locator('#register-date-of-birth').fill('1990-10-09');
  await dialog.getByLabel('Пароль для регистрации').fill('AnotherPass123!');
  await dialog.getByPlaceholder('Повтор пароля').fill('AnotherPass123!');
  await dialog.getByRole('checkbox', { name: /Публичную оферту/ }).check();
  await dialog.getByRole('checkbox', { name: /Политикой обработки/ }).check();
  await dialog.getByRole('checkbox', { name: /Согласие на обработку/ }).check();
  const registration = page.waitForResponse(response =>
    response.url().endsWith('/auth/email/register')
  );
  await dialog.getByRole('button', { name: 'Зарегистрироваться' }).click();
  const response = await registration;
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    message: 'Если регистрация возможна, проверьте почту для подтверждения адреса',
  });
  await expect(
    page.getByText('Если регистрация возможна, письмо для подтверждения придёт на указанный адрес.')
  ).toBeVisible();
  await mailbox.reload();
  expect(await mailbox.locator('li').count()).toBe(before);
});

test('legacy account claims one nickname and cannot replace it', async ({ page }) => {
  test.skip(process.env.QA_IDENTITY_BACKEND !== '1', 'Requires isolated Stage 8 identity QA API');
  await useIsolatedApi(page);
  await page.goto('/dashboard');
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Электронная почта').fill('qa-owner@example.com');
  await dialog.getByPlaceholder('Пароль', { exact: true }).fill('QaOwnerPass123!');
  await dialog.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/dashboard/settings?tab=profile');
  await expect(page.getByLabel('Публичный ник — выберите один раз')).toBeVisible();
  await page.getByLabel('Публичный ник — выберите один раз').fill('Owner_QA_7');
  await expect(page.locator('#claim-username-status')).toContainText('Ник свободен');
  await page.getByRole('button', { name: 'Сохранить ник' }).click();
  await expect(page.getByText('@Owner_QA_7')).toBeVisible();
  await page.reload();
  await expect(page.getByText('@Owner_QA_7')).toBeVisible();
  await expect(page.getByLabel('Публичный ник — выберите один раз')).toHaveCount(0);
  await page.goto('/dashboard/messages');
  await page.getByRole('button', { name: 'Друзья' }).click();
  const search = page.getByPlaceholder('Найти по ID (например: 49835940)');
  await search.fill('QA Owner');
  await search.press('Enter');
  await expect(page.getByText('@Contact_QA_7 ·', { exact: false })).toBeVisible();
  await page.getByText('@Contact_QA_7 ·', { exact: false }).click();
  await expect(page.getByText(/@Contact_QA_7 · User ID:/)).toBeVisible();
});
