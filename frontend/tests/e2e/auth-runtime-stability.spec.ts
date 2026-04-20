import { expect, test } from '@playwright/test';

/**
 * Auth runtime: session + bearer token, transient /me failure, logout, re-login.
 * Регистрация/логин через API — UI-модалка не является единственным источником истины для токена.
 */
test('Auth runtime stability: API session, reload, /me timeout, logout, relogin', async ({
  page,
  request,
  baseURL,
}) => {
  expect(baseURL).toBeTruthy();
  const stamp = Date.now();
  const email = `final_auth_${stamp}@example.com`;
  const password = 'Qa!23456';

  const reg = await request.post(`${baseURL}/auth/email/register`, {
    data: { email, password, name: 'QA Final' },
  });
  expect([200, 400]).toContain(reg.status());

  const login1 = await request.post(`${baseURL}/auth/email/login`, {
    data: { email, password },
  });
  expect(login1.status()).toBe(200);
  const login1Json = await login1.json();
  const token1 = login1Json?.access_token as string | undefined;
  expect(!!token1).toBeTruthy();

  await page.addInitScript((t: string) => {
    localStorage.setItem('auth_token', t);
  }, String(token1));

  await page.goto('/dashboard');
  await page.waitForURL(/\/dashboard/);
  await page.waitForLoadState('networkidle');

  await page.reload();
  await page.waitForURL(/\/dashboard/);
  await page.waitForLoadState('networkidle');

  let meBlocked = false;
  await page.route('**/me', async route => {
    if (!meBlocked) {
      meBlocked = true;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.reload();
  await page.waitForTimeout(4200);
  await page.waitForURL(/\/dashboard/);
  const loginInputs = await page.locator('input[name="email"], input[type="email"]').count();
  expect(loginInputs).toBe(0);
  await page.unroute('**/me');

  await request.post(`${baseURL}/auth/logout`);
  await page.evaluate(() => localStorage.removeItem('auth_token'));
  await page.reload();
  await page.waitForTimeout(800);

  const login2 = await request.post(`${baseURL}/auth/email/login`, {
    data: { email, password },
  });
  expect(login2.status()).toBe(200);
  const login2Json = await login2.json();
  const token2 = login2Json?.access_token as string | undefined;
  expect(!!token2).toBeTruthy();

  await page.evaluate((t: string) => {
    localStorage.setItem('auth_token', t);
  }, String(token2));
  await page.goto('/dashboard');
  await page.waitForURL(/\/dashboard/);
  await page.waitForLoadState('networkidle');
});
