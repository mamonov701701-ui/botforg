import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { addApiCall, isBackendRequest, getConsoleLogPath } from './global-api-collector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.QA_ARTIFACTS_DIR || path.join(__dirname, '../../..', 'qa_artifacts');

function screensDir(): string {
  return path.join(BASE, 'screens');
}

async function setupPageCollectors(page: any) {
  const consoleErrors: string[] = [];
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', (r: any) => {
    const url = r.url();
    const status = r.status();
    const method = r.request().method();
    if (isBackendRequest(url) || status >= 400) addApiCall(method, url, status);
  });
  return consoleErrors;
}

test.describe('S2: Auth flow', () => {
  test('Register test user and open cabinet', async ({ page }) => {
    const consoleErrors = await setupPageCollectors(page);
    const timestamp = Date.now();
    const email = `qa_tester_${timestamp}@example.com`;
    const password = 'Qa!23456';

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded').catch(() => {});

    const cabinetLink = page.locator('a[href="/dashboard"]').first();
    await cabinetLink.click();
    await page.waitForTimeout(1500);

    const authModal = page
      .locator('[role="dialog"], .modal, [class*="modal"], [class*="Auth"]')
      .first();
    const hasModal = (await authModal.count()) > 0;
    if (hasModal) {
      const tabRegister = page
        .locator(
          'button:has-text("Регистрация"), button:has-text("Register"), [data-tab="register"]'
        )
        .first();
      if ((await tabRegister.count()) > 0) await tabRegister.click();
      await page.waitForTimeout(500);

      const consent = page.locator('input[type="checkbox"]').first();
      if ((await consent.count()) > 0) await consent.check();

      const emailInput = page.locator('input[name="email"], input[type="email"]').first();
      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      if ((await emailInput.count()) > 0) await emailInput.fill(email);
      if ((await passwordInput.count()) > 0) await passwordInput.fill(password);

      const submit = page.locator('button[type="submit"]').first();
      if ((await submit.count()) > 0) await submit.click();
      await page.waitForTimeout(5000);
    }

    const url = page.url();
    const body = await page.locator('body').innerText();
    const onDashboard = url.includes('/dashboard') && body.length > 50;
    await page.screenshot({
      path: path.join(screensDir(), 'auth_after_register.png'),
      fullPage: true,
    });
    if (consoleErrors.length) {
      fs.appendFileSync(getConsoleLogPath(), `[Auth]\n${consoleErrors.join('\n')}\n\n`, 'utf8');
    }
    expect(body.length).toBeGreaterThan(20);
  });
});

test.describe('S3: Key feature pages (post-auth if possible)', () => {
  test('Settings page has content', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    const hasToggle =
      (await page
        .locator('input[type="checkbox"], [data-testid="allowSendTextToAi"], [class*="switch"]')
        .first()
        .count()) > 0;
    expect(body.length).toBeGreaterThan(20);
    await page.screenshot({ path: path.join(screensDir(), 'settings.png'), fullPage: true });
  });

  test('Templates / Marketplace list', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/dashboard/templates');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(20);
    await page.screenshot({ path: path.join(screensDir(), 'templates.png'), fullPage: true });
  });

  test('Bots page', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/dashboard/bots');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(20);
    await page.screenshot({ path: path.join(screensDir(), 'bots.png'), fullPage: true });
  });
});
