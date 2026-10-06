import { defineConfig, devices } from '@playwright/test';

const PORT = 3210;
export const ADMIN_TOKEN = 'e2e-admin-token-solo-per-i-test-0123456789';

/** Test end-to-end: server reale (archivio in memoria) che serve la web app compilata. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
    },
  ],
  webServer: {
    command: 'NODE_ENV=production npm run build && npm start',
    url: `http://127.0.0.1:${String(PORT)}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      ADMIN_TOKEN,
      WEB_DIST: '../web/dist',
      LOG_LEVEL: 'warn',
      TICK_INTERVAL_MS: String(24 * 60 * 60 * 1000),
      CITY_SEED: 'e2e',
    },
  },
});
