/**
 * Визуальный smoke-тест ключевых экранов BotForg.
 * Для каждого экрана: скриншот + проверка console.error/console.warn.
 * Скриншоты: frontend/e2e/screenshots/
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.resolve(__dirname, '../../e2e/screenshots');

function ensureScreenshotsDir() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

test.beforeAll(() => ensureScreenshotsDir());

const SCREENS: { path: string; name: string }[] = [
  { path: '/login', name: 'login' },
  { path: '/dashboard', name: 'dashboard' },
  { path: '/dashboard/bots', name: 'bots' },
  { path: '/editor/1', name: 'editor' },
  { path: '/dashboard/templates', name: 'templates' },
  { path: '/dashboard/analytics', name: 'analytics' },
  { path: '/pricing', name: 'pricing' },
];

for (const { path: route, name } of SCREENS) {
  test(`Скриншот и проверка консоли: ${name} (${route})`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];

    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') consoleErrors.push(text);
      if (msg.type() === 'warning') consoleWarnings.push(text);
    });

    const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (!response) {
      throw new Error(`Страница ${route} не загрузилась: нет ответа`);
    }
    if (response.status() >= 400) {
      throw new Error(`Страница ${route} не загрузилась: HTTP ${response.status()}`);
    }

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    const body = await page.locator('body').innerText();
    if (body.length < 10) {
      throw new Error(`Страница ${route} пустая или не отрендерилась (body.length=${body.length})`);
    }

    const screenshotPath = path.join(SCREENSHOTS_DIR, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const isExpectedError = (e: string) =>
      e.includes('ResizeObserver') ||
      e.includes('favicon') ||
      e.includes('404') ||
      e.includes('Failed to load resource') ||
      e.includes('401') ||
      e.includes('Unauthorized') ||
      e.includes('Could not validate credentials') ||
      e.includes('tokenExists') ||
      e.includes('Failed to fetch bots') ||
      e.includes('Failed to load bots');
    const errors = consoleErrors.filter(e => !isExpectedError(e));
    const isExpectedWarning = (w: string) =>
      w.includes('browserslist') ||
      w.includes('NO_COLOR') ||
      w.includes('DeprecationWarning') ||
      (w.includes('[API]') && (w.includes('No token found') || w.includes('401')));
    const warnings = consoleWarnings.filter(w => !isExpectedWarning(w));

    if (errors.length > 0) {
      throw new Error(
        `[${name}] ${route}: JS-ошибки в консоли:\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
      );
    }
    if (warnings.length > 0) {
      throw new Error(
        `[${name}] ${route}: JS-предупреждения в консоли:\n${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
      );
    }

    expect(errors.length).toBe(0);
    expect(warnings.length).toBe(0);
  });
}
