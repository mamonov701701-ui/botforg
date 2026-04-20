import { expect, test } from '@playwright/test';

const BOT_ID = 29;

test('CRM browser smoke via frontend proxy -> backend :8002', async ({
  context,
  page,
  baseURL,
}) => {
  const token = process.env.QA_SESSION_TOKEN;
  expect(token, 'QA_SESSION_TOKEN is required').toBeTruthy();
  expect(baseURL, 'Playwright baseURL is required').toBeTruthy();

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

  const crmResponses: Array<{ method: string; url: string; status: number }> = [];
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes(`/bots/${BOT_ID}/crm/`)) {
      crmResponses.push({
        method: resp.request().method(),
        url,
        status: resp.status(),
      });
    }
  });

  await page.goto(`/dashboard/bots/${BOT_ID}/crm/overview`);
  await page.waitForLoadState('networkidle');

  const waitOverviewProd = page.waitForResponse(
    r =>
      r.url().includes(`/bots/${BOT_ID}/crm/overview`) &&
      r.url().includes('environment=prod') &&
      r.status() === 200
  );
  await page.reload();
  await waitOverviewProd;

  const waitOverviewDev = page.waitForResponse(
    r =>
      r.url().includes(`/bots/${BOT_ID}/crm/overview`) &&
      r.url().includes('environment=dev') &&
      r.status() === 200
  );
  await page.getByRole('tab', { name: 'Тестовые' }).click();
  await waitOverviewDev;

  const waitOverviewAll = page.waitForResponse(
    r =>
      r.url().includes(`/bots/${BOT_ID}/crm/overview`) &&
      r.url().includes('environment=all') &&
      r.status() === 200
  );
  await page.getByRole('tab', { name: 'Все' }).click();
  await waitOverviewAll;

  const waitSummaryProd = page.waitForResponse(
    r =>
      r.url().includes(`/bots/${BOT_ID}/crm/statuses/summary`) &&
      r.url().includes('environment=prod') &&
      r.status() === 200
  );
  await page.getByRole('tab', { name: 'Реальные' }).click();
  const crmNav = page.getByLabel('Разделы CRM');
  await crmNav.getByRole('link', { name: 'Статусы' }).click();
  await waitSummaryProd;

  await crmNav.getByRole('link', { name: 'Обзор' }).click();
  await page.waitForLoadState('networkidle');
  await crmNav.getByRole('link', { name: 'Контакты' }).click();
  await page.waitForLoadState('networkidle');
  await crmNav.getByRole('link', { name: 'Поля' }).click();
  await page.waitForLoadState('networkidle');
  await crmNav.getByRole('link', { name: 'Теги' }).click();
  await page.waitForLoadState('networkidle');
  await crmNav.getByRole('link', { name: 'Статусы' }).click();
  await page.waitForLoadState('networkidle');

  const hasTemporaryServerError = await page
    .getByText(/временн.*ошибк.*сервера/i)
    .first()
    .isVisible()
    .catch(() => false);
  expect(hasTemporaryServerError).toBeFalsy();

  const crm5xx = crmResponses.filter(r => r.status >= 500);
  expect(crm5xx, `No CRM 5xx expected. Got: ${JSON.stringify(crm5xx, null, 2)}`).toEqual([]);

  const required = [
    `/bots/${BOT_ID}/crm/overview?environment=prod`,
    `/bots/${BOT_ID}/crm/overview?environment=dev`,
    `/bots/${BOT_ID}/crm/overview?environment=all`,
    `/bots/${BOT_ID}/crm/statuses/summary?environment=prod`,
  ];
  for (const needle of required) {
    const ok = crmResponses.some(r => r.status === 200 && r.url.includes(needle));
    expect(ok, `Expected 200 for ${needle}`).toBeTruthy();
  }

  // Network proof in test output.
  const compact = crmResponses
    .map(r => `${r.method} ${new URL(r.url).pathname}${new URL(r.url).search} -> ${r.status}`)
    .filter(line => line.includes(`/bots/${BOT_ID}/crm/`));
  console.log('CRM_NETWORK_CALLS');
  for (const line of compact) console.log(line);
});
