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

function ensureDirs() {
  fs.mkdirSync(screensDir(), { recursive: true });
}

test.beforeAll(() => ensureDirs());

async function setupPageCollectors(page: any) {
  const consoleErrors: string[] = [];
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', (r: any) => {
    const url = r.url();
    const status = r.status();
    const method = r.request().method();
    if (isBackendRequest(url) || status >= 400) {
      addApiCall(method, url, status);
    }
  });
  return consoleErrors;
}

function routeToSlug(route: string): string {
  return route.replace(/^\//, '').replace(/\//g, '_') || 'home';
}

test.describe('S1: Public pages', () => {
  test('Home page', async ({ page }) => {
    const consoleErrors = await setupPageCollectors(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const hasContent = (await page.locator(CONTENT_SELECTOR).first().count()) > 0;
    const bodyLen = (await page.locator('body').innerText()).length;
    expect(hasContent || bodyLen > 50).toBeTruthy();
    await page.screenshot({
      path: path.join(screensDir(), routeToSlug('/') + '.png'),
      fullPage: true,
    });
    if (consoleErrors.length) {
      fs.appendFileSync(
        getConsoleLogPath(),
        '[GET /]\n' + consoleErrors.join('\n') + '\n\n',
        'utf8'
      );
    }
  });

  test('Menu: BF agent, Market, Features, Pricing, Dashboard, Editor', async ({ page }) => {
    const consoleErrors = await setupPageCollectors(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded').catch(() => {});

    const links = [
      { name: 'bf-agent', selector: 'a[href="/bf-agent"]' },
      { name: 'market', selector: 'a[href="/market"]' },
      { name: 'features', selector: 'a[href="/features"]' },
      { name: 'pricing', selector: 'a[href="/pricing"]' },
      { name: 'dashboard', selector: 'a[href="/dashboard"]' },
      { name: 'editor', selector: 'a[href="/dashboard/bots"]' },
    ];

    for (const { name, selector } of links) {
      const link = page.locator(selector).first();
      if ((await link.count()) > 0) {
        await link.click();
        await page.waitForTimeout(1500);
        const bodyLen = (await page.locator('body').innerText()).length;
        expect(bodyLen > 20).toBeTruthy();
        await page.screenshot({
          path: path.join(screensDir(), 'menu_' + name + '.png'),
          fullPage: true,
        });
      }
    }
    if (consoleErrors.length) {
      fs.appendFileSync(
        getConsoleLogPath(),
        '[Menu crawl]\n' + consoleErrors.join('\n') + '\n\n',
        'utf8'
      );
    }
  });

  test('Market page', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/market');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(20);
    await page.screenshot({ path: path.join(screensDir(), 'market.png'), fullPage: true });
  });

  test('Market item detail from list or fallback', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/market');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2000);

    const card = page.locator('[data-testid="market-item-card"]').first();
    if ((await card.count()) > 0) {
      await card.click();
      await expect(page).toHaveURL(/\/market\/items\/\d+/);
      await expect(page.locator('[data-testid="market-item-detail"]')).toBeVisible();
      const detailLoaded = page.locator('[data-testid="market-item-detail-title"]');
      const detailError = page.locator('[data-testid="market-item-detail-error"]');
      await expect(detailLoaded.or(detailError)).toBeVisible({ timeout: 15000 });
    } else {
      await page.goto('/market/items/1');
      await expect(page.locator('[data-testid="market-item-detail"]')).toBeVisible();
      await expect(
        page
          .locator('[data-testid="market-item-detail-error"]')
          .or(page.locator('[data-testid="market-item-detail-loading"]'))
      ).toBeVisible({ timeout: 15000 });
    }
  });

  test('Features page', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/features');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(20);
    await page.screenshot({ path: path.join(screensDir(), 'features.png'), fullPage: true });
  });

  test('Pricing page', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/pricing');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(20);
    await page.screenshot({ path: path.join(screensDir(), 'pricing.png'), fullPage: true });
  });

  test('Dashboard guest', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(20);
    await page.screenshot({ path: path.join(screensDir(), 'dashboard_guest.png'), fullPage: true });
  });

  test('Editor /editor/1', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/editor/1');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);
    await page.screenshot({ path: path.join(screensDir(), 'editor_1.png'), fullPage: true });
  });

  test('404 page', async ({ page }) => {
    await page.goto('/no-such-route-404');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).toMatch(/404|не найден|not found|страниц/i);
    await page.screenshot({ path: path.join(screensDir(), 'not_found.png'), fullPage: true });
  });
});
