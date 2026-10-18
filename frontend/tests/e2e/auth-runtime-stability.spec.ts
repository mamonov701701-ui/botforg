import { expect, test } from '@playwright/test';

/**
 * Auth runtime: session + bearer token, transient /me failure, logout, re-login.
 * Isolated seeded account; no Development DB or production SMTP access.
 */
test('Auth runtime stability: API session, reload, /me timeout, logout, relogin', async ({
  page,
  request,
  baseURL,
}) => {
  test.skip(process.env.QA_IDENTITY_BACKEND !== '1', 'Requires isolated Stage 8 identity QA API');
  expect(baseURL).toBeTruthy();
  const api = 'http://127.0.0.1:18001';
  const email = 'qa-owner@example.com';
  const password = 'QaOwnerPass123!';
  await page.route('http://127.0.0.1:5173/**', async route => {
    const url = new URL(route.request().url());
    if (!/^(\/me(?:\/|$)|\/api\/user\/|\/privacy\/)/.test(url.pathname)) {
      await route.continue();
      return;
    }
    const response = await route.fetch({ url: `${api}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });

  const login1 = await request.post(`${api}/auth/email/login`, {
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

  await request.post(`${api}/auth/logout`);
  await page.evaluate(() => localStorage.removeItem('auth_token'));
  await page.reload();
  await page.waitForTimeout(800);

  const login2 = await request.post(`${api}/auth/email/login`, {
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
