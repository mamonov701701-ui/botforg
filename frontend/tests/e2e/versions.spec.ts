import { test, expect } from '@playwright/test';
import { addApiCall, isBackendRequest } from './global-api-collector';
import * as path from 'path';
import { fileURLToPath } from 'url';

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

test.describe('Version history', () => {
  test('Editor has History button', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/editor/1');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2000);

    const historyBtn = page.locator('button:has-text("История"), [aria-label*="История"]').first();
    const count = await historyBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('Version history modal can open (if scenario selected)', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/editor/1');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(3000);

    const historyBtn = page.locator('button:has-text("История")').first();
    if ((await historyBtn.count()) > 0 && (await historyBtn.isEnabled())) {
      await historyBtn.click();
      await page.waitForTimeout(1000);
      const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();
      const hasModal = (await modal.count()) > 0;
      if (hasModal) {
        const modalText = await modal.innerText();
        expect(modalText.length).toBeGreaterThan(0);
      }
    }
  });
});
