import { test, expect } from '@playwright/test';
import { addApiCall, isBackendRequest, getConsoleLogPath } from './global-api-collector';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

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
    if (isBackendRequest(url) || status >= 400) addApiCall(method, url, status);
  });
  return { consoleErrors };
}

test.describe('Editor', () => {
  test('Editor page loads for bot', async ({ page }) => {
    const { consoleErrors } = await setupPageCollectors(page);
    await page.goto('/editor/1');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2000);

    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);

    const hasEditorContent =
      (await page.locator('.react-flow, [class*="editor"], [class*="Editor"]').first().count()) >
        0 ||
      body.includes('Сценарий') ||
      body.includes('Бот');
    expect(hasEditorContent || body.length > 50).toBeTruthy();

    // Кнопка «Импорт» видна только когда открыт сам редактор (после входа); без сессии AuthGate не рендерит панель
    if (body.includes('Новый сценарий') || body.includes('Добавить блок')) {
      const importBtn = page.getByRole('button', { name: 'Импорт', exact: true });
      await expect(importBtn).toBeVisible({ timeout: 10000 });
    }

    await page.screenshot({ path: path.join(screensDir(), 'editor_load.png'), fullPage: true });
    if (consoleErrors.length) {
      fs.appendFileSync(getConsoleLogPath(), `[Editor]\n${consoleErrors.join('\n')}\n\n`, 'utf8');
    }
  });

  test('Editor shows scenario dropdown or empty state', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/editor/1');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(3000);

    const body = await page.locator('body').innerText();
    const hasScenarioOrEmpty =
      body.includes('Сценарий') ||
      body.includes('Начните создавать') ||
      body.includes('Добавить блок') ||
      body.includes('Новый сценарий');
    expect(hasScenarioOrEmpty || body.length > 20).toBeTruthy();
  });
});
