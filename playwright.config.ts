import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.IRM_E2E_API_PORT ?? '8887';
const webPort = process.env.IRM_E2E_WEB_PORT ?? '5183';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: process.env.IRM_E2E_OUTPUT_DIR ?? 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://127.0.0.1:${webPort}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @irm/server dev',
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      env: { IRM_LISTEN_ADDR: `127.0.0.1:${apiPort}`, IRM_DATA_DIR: `data/e2e/${Date.now()}` },
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @irm/web build && pnpm --filter @irm/web exec vite preview --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: `http://127.0.0.1:${webPort}`,
      env: { IRM_API_TARGET: `http://127.0.0.1:${apiPort}` },
      timeout: 90_000,
    },
  ],
});
