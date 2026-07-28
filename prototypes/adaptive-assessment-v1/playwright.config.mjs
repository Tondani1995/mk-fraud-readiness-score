import { defineConfig } from '@playwright/test';

/**
 * PROTOTYPE ONLY. Serves the static prototype from this directory.
 * No production build, no environment variables, no network egress.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /browser\.spec\.mjs/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:8899',
    trace: 'off',
    screenshot: 'off'
  },
  webServer: {
    command: 'python3 -m http.server 8899',
    url: 'http://localhost:8899/index.html',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
