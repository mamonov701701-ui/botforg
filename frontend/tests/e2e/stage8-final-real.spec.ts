import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

function totpCode(secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const letter of secret.toUpperCase().replace(/=+$/, '')) {
    value = (value << 5) | alphabet.indexOf(letter);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

test('Stage 8 account smoke with local backend and mailbox', async ({ page, request }) => {
  test.skip(
    process.env.QA_REAL_BACKEND !== '1',
    'Run only against the local Stage 8 Development QA services'
  );
  const email = `stage8-final-${Date.now()}@example.com`;
  const password = 'QaPass123!';
  const api = 'http://127.0.0.1:8001';
  const docsResponse = await request.get(`${api}/legal/documents`);
  expect(docsResponse.ok()).toBe(true);
  const docs = (await docsResponse.json()) as { id: number; doc_type: string; status: string }[];
  const revisions = Object.fromEntries(
    ['public_offer', 'privacy_policy', 'personal_data_consent'].map(type => {
      const doc = docs.find(item => item.doc_type === type && item.status === 'published');
      expect(doc).toBeTruthy();
      return [type, doc!.id];
    })
  );
  const registration = await request.post(`${api}/auth/email/register`, {
    data: {
      email,
      password,
      name: 'QA Security',
      username: `qa_security_${Date.now()}`,
      date_of_birth: '1990-10-10',
      legal_revision_ids: revisions,
      terms_accepted: true,
      privacy_acknowledged: true,
      personal_data_consent_accepted: true,
    },
  });
  expect(registration.status()).toBe(200);

  await page.goto('http://127.0.0.1:8025/');
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.locator('li').filter({ hasText: email }).count();
      },
      { timeout: 20000 }
    )
    .toBeGreaterThan(0);
  await page.locator('li').filter({ hasText: email }).first().locator('a').click();
  const link = await page
    .getByRole('link', { name: 'Открыть ссылку подтверждения' })
    .getAttribute('href');
  expect(link).toBeTruthy();
  const token = new URL(link!).hash.slice('#token='.length);
  expect(token.length).toBeGreaterThan(30);
  const preview = await request.post(`${api}/auth/email/verify-preview`, { data: { token } });
  expect(preview.status()).toBe(200);
  await page.goto(link!);
  const verifyResponse = page.waitForResponse(response =>
    response.url().endsWith('/auth/email/verify')
  );
  await page.getByRole('button', { name: 'Подтвердить адрес' }).click();
  expect((await verifyResponse).status()).toBe(200);
  await expect(page.getByText('Адрес подтверждён. Теперь войдите в аккаунт.')).toBeVisible();

  await page.goto('/dashboard');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('Электронная почта').fill(email);
  await dialog.getByPlaceholder('Пароль', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15000 });
  await page.goto('/dashboard/settings?tab=profile');
  await page.locator('#display-name').fill('QA Security Updated');
  await page.getByRole('button', { name: 'Сохранить профиль' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Профиль сохранён' })).toBeVisible();
  await page.locator('#profile-phone').fill('+79991234567');
  await page.getByRole('button', { name: 'Сохранить номер' }).click();
  await expect(page.getByText('Номер сохранён без подтверждения')).toBeVisible();
  await page.reload();
  await expect(page.locator('#display-name')).toHaveValue('QA Security Updated');
  await expect(page.locator('#profile-phone')).toHaveValue('+79991234567');
  await expect(page.getByText('Номер не подтверждён.', { exact: false })).toBeVisible();
  await page.locator('#avatar-file').setInputFiles('public/logo.png');
  await expect(page.getByAltText('Ваш аватар')).toBeVisible();
  await page.reload();
  await expect(page.getByAltText('Ваш аватар')).toBeVisible();
  await page.getByRole('button', { name: 'Удалить аватар' }).click();
  await expect(page.getByAltText('Ваш аватар')).toBeHidden();
  await page.goto('/dashboard/settings?tab=security');
  await expect(page.getByRole('heading', { name: 'Смена пароля' })).toBeVisible();
  await expect(page.locator('#email-password')).toHaveValue('');
  await expect(page.locator('#password-current')).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Смена пароля' })).toBeVisible();
  await expect(page.locator('#email-password')).toHaveValue('');
  await page.getByRole('button', { name: 'Конфиденциальность' }).click();
  await expect(page).toHaveURL(/tab=privacy/);
  const exportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать копию моих данных (JSON)' }).click();
  expect((await exportDownload).suggestedFilename()).toBe('botforg-account-data.json');
  const legalLink = page.getByRole('link', {
    name: /Открыть действующие условия и историю согласий/,
  });
  await expect(legalLink).toBeVisible();
  await legalLink.click();
  await expect(page.getByTestId('account-legal-consent-history')).toBeVisible();
  await page.getByTestId('account-legal-read-public-offer').click();
  await expect(page.getByTestId('legal-doc-body')).toBeVisible();
  expect(
    await page
      .getByTestId('legal-doc-body')
      .evaluate(element => getComputedStyle(element).backgroundColor)
  ).toBe('rgb(10, 27, 61)');
  await page.reload();
  await expect(page.getByTestId('legal-doc-body')).toBeVisible();
  await expect(page.getByTestId('dashboard-sidebar')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('account-legal-consent-history')).toBeVisible();
  await page.goto('/legal/public-offer');
  await expect(page.getByTestId('legal-doc-body')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('legal-doc-body')).toBeVisible();
  await page
    .getByTestId('site-header-nav-desktop')
    .getByRole('link', { name: 'Личный кабинет' })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/dashboard/settings?tab=privacy');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const me = await page.evaluate(
    async () =>
      (
        await fetch('/me', {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
        })
      ).status
  );
  expect(me).toBe(200);

  await page.goto('/dashboard/settings?tab=security');
  await expect(page.getByText('Текущая сессия')).toBeVisible();
  await page.locator('#totp-password').fill(password);
  await page.getByRole('button', { name: 'Подключить', exact: true }).click();
  await expect(page.getByAltText('QR-код настройки двухфакторной защиты')).toBeVisible();
  await page.getByRole('button', { name: 'Показать ключ вручную' }).click();
  await expect(page.getByRole('button', { name: 'Скопировать' })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить настройку' }).click();
  await expect(page.getByRole('button', { name: 'Подключить', exact: true })).toBeVisible();

  await page.evaluate(() => localStorage.removeItem('auth_token'));
  await page.goto('/dashboard');
  const resetDialog = page.getByRole('dialog');
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByRole('button', { name: 'Забыли пароль?' }).click();
  await resetDialog.locator('#reset-email').fill(email);
  const resetRequest = page.waitForResponse(response =>
    response.url().endsWith('/auth/email/request-reset')
  );
  await resetDialog.getByRole('button', { name: 'Отправить ссылку' }).click();
  expect((await resetRequest).status()).toBe(200);
  await page.goto('http://127.0.0.1:8025/');
  await page.locator('li').filter({ hasText: email }).first().locator('a').click();
  await page.getByRole('link', { name: 'Открыть ссылку подтверждения' }).click();
  await expect(page.getByRole('heading', { name: 'Сброс пароля' })).toBeVisible();
  await page.getByPlaceholder('Новый пароль').fill('QaChanged123!');
  await page.getByPlaceholder('Подтвердите пароль').fill('QaChanged123!');
  await page.getByRole('button', { name: 'Изменить пароль' }).click();
  await expect(page.getByText('Пароль изменён. Теперь войдите в аккаунт.')).toBeVisible();
  const oldLogin = await request.post(`${api}/auth/email/login`, { data: { email, password } });
  expect(oldLogin.status()).toBe(401);
  const newLogin = await request.post(`${api}/auth/email/login`, {
    data: { email, password: 'QaChanged123!' },
  });
  expect(newLogin.status()).toBe(200);
  const auth = { Authorization: `Bearer ${(await newLogin.json()).access_token}` };
  const setup = await request.post(`${api}/api/user/security/totp/setup`, {
    headers: auth,
    data: { password: 'QaChanged123!' },
  });
  expect(setup.status()).toBe(200);
  const confirmed = await request.post(`${api}/api/user/security/totp/confirm`, {
    headers: auth,
    data: { code: totpCode((await setup.json()).secret) },
  });
  expect(confirmed.status()).toBe(200);
  const backupCodes = (await confirmed.json()).backup_codes as string[];
  expect(backupCodes.length).toBeGreaterThan(1);
  expect((await request.get(`${api}/me`, { headers: auth })).status()).toBe(401);
  await page.goto('/dashboard');
  const twoFactorDialog = page.getByRole('dialog');
  await expect(twoFactorDialog).toBeVisible();
  await twoFactorDialog.getByPlaceholder('Электронная почта').fill(email);
  await twoFactorDialog.getByPlaceholder('Пароль', { exact: true }).fill('QaChanged123!');
  await twoFactorDialog.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(twoFactorDialog.getByText('Код из приложения или резервный код')).toBeVisible();
  await twoFactorDialog.locator('#login-two-factor').fill(backupCodes[0]);
  await twoFactorDialog.getByRole('button', { name: 'Подтвердить вход' }).click();
  await expect(twoFactorDialog).toBeHidden();
  expect(
    await page.evaluate(
      async () =>
        (
          await fetch('/me', {
            headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
          })
        ).status
    )
  ).toBe(200);
  const reused = await request.post(`${api}/auth/email/login`, {
    data: { email, password: 'QaChanged123!' },
  });
  const reuseChallenge = (await reused.json()).challenge;
  expect(
    (
      await request.post(`${api}/auth/email/complete-2fa`, {
        data: { challenge: reuseChallenge, code: backupCodes[0] },
      })
    ).status()
  ).toBe(401);
  const activeToken = await page.evaluate(() => localStorage.getItem('auth_token'));
  const disabled = await request.post(`${api}/api/user/security/totp/disable`, {
    headers: { Authorization: `Bearer ${activeToken}` },
    data: { current_password: 'QaChanged123!', code: backupCodes[1] },
  });
  expect(disabled.status()).toBe(200);
  expect(
    (
      await request.get(`${api}/me`, { headers: { Authorization: `Bearer ${activeToken}` } })
    ).status()
  ).toBe(401);
});
