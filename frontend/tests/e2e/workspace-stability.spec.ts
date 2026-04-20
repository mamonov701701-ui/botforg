import { expect, test } from '@playwright/test';

const BOT_ID = 29;

test('Workspace stability: bots list and workspace tabs open without 5xx', async ({
  context,
  page,
  baseURL,
}) => {
  const token = process.env.QA_SESSION_TOKEN;
  expect(token).toBeTruthy();
  expect(baseURL).toBeTruthy();

  await context.addCookies([
    {
      name: 'session',
      value: String(token),
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
  await page.addInitScript((t: string) => {
    localStorage.setItem('auth_token', t);
  }, String(token));

  const calls: Array<{ url: string; status: number }> = [];
  page.on('response', r => {
    const u = r.url();
    if (
      u.includes('/bots') ||
      u.includes('/crm/') ||
      u.includes('/scenarios') ||
      u.includes('/analytics')
    ) {
      calls.push({ url: u, status: r.status() });
    }
  });

  await page.goto('/dashboard/bots');
  await page.waitForLoadState('networkidle');
  await page.goto(`/dashboard/bots/${BOT_ID}/overview`);
  await page.waitForLoadState('networkidle');
  await page.goto(`/dashboard/bots/${BOT_ID}/crm/overview`);
  await page.waitForLoadState('networkidle');
  await page.goto(`/dashboard/bots/${BOT_ID}/scenarios`);
  await page.waitForLoadState('networkidle');
  await page.goto(`/dashboard/bots/${BOT_ID}/analytics`);
  await page.waitForLoadState('networkidle');
  await page.goto(`/dashboard/bots/${BOT_ID}/settings`);
  await page.waitForLoadState('networkidle');

  const has5xx = calls.some(c => c.status >= 500);
  expect(
    has5xx,
    JSON.stringify(
      calls.filter(c => c.status >= 500),
      null,
      2
    )
  ).toBeFalsy();
});
