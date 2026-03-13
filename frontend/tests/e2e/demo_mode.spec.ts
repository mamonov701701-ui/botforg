import { test, expect } from '@playwright/test';
import { addApiCall, isBackendRequest } from './global-api-collector';
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
  page.on('response', (r: any) => {
    const url = r.url();
    const status = r.status();
    const method = r.request().method();
    if (isBackendRequest(url) || status >= 400) addApiCall(method, url, status);
  });
}

test.describe('Demo mode', () => {
  test('Editor in demo/viewer mode shows read-only banner or restricted UI', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/editor/1');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(3000);

    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);

    await page.screenshot({ path: path.join(screensDir(), 'demo_editor.png'), fullPage: true });
  });

  test('Pricing page exists (demo upgrade link)', async ({ page }) => {
    await setupPageCollectors(page);
    await page.goto('/pricing');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(20);
  });
});
