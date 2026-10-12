import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [['list'], ['json', { outputFile: 'output/browser-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4321',
    viewport: { width: 1440, height: 1000 },
    channel: process.env.WEBSITE_BROWSER_CHANNEL || undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: { command: 'pnpm preview', url: 'http://127.0.0.1:4321', reuseExistingServer: !process.env.CI, timeout: 30000 },
});
