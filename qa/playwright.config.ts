import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const projectRoot = path.resolve(__dirname, '..');
const runDir = process.env.QA_ARTIFACTS_DIR || path.join(projectRoot, 'qa_artifacts');
const frontendDir = path.join(projectRoot, 'frontend');

export default defineConfig({
  testDir: path.join(projectRoot, 'frontend', 'tests', 'e2e'),
  outputDir: path.join(runDir, 'test-results'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(runDir, 'playwright-report'), open: 'never' }],
  ],
  globalTeardown: path.join(projectRoot, 'frontend', 'tests', 'e2e', 'global-teardown.ts'),
  use: {
    baseURL: process.env.QA_FRONTEND_URL || 'http://127.0.0.1:5173',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  timeout: 60000,
  webServer: process.env.QA_FRONTEND_URL
    ? undefined
    : {
        command: 'npm run dev',
        cwd: frontendDir,
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
