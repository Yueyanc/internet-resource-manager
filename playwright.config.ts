import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:5183', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @irm/server dev',
      url: 'http://127.0.0.1:8887/api/v1/health',
      env: { IRM_LISTEN_ADDR: '127.0.0.1:8887', IRM_DATA_DIR: 'data/e2e' },
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @irm/web exec vite --host 127.0.0.1 --port 5183 --strictPort',
      url: 'http://127.0.0.1:5183',
      env: { IRM_API_TARGET: 'http://127.0.0.1:8887' },
      timeout: 60_000,
    },
  ],
});
