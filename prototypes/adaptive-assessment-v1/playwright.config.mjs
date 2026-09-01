import { defineConfig, devices } from '@playwright/test';

/**
 * PROTOTYPE ONLY. Serves the static prototype from this directory.
 * No production build, no environment variables, no network egress.
 *
 * Runs the full suite in Chromium, Firefox and WebKit. Set PW_PROJECT to limit
 * to one engine locally, e.g. PW_PROJECT=chromium npm run test:browser
 */

const only = process.env.PW_PROJECT;

const allProjects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } }
];

export default defineConfig({
  testDir: './tests',
  testMatch: /browser\.spec\.mjs/,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:8899',
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    screenshot: 'off'
  },
  projects: only ? allProjects.filter((p) => p.name === only) : allProjects,
  webServer: {
    command: 'node tools/review-server.mjs',
    url: 'http://localhost:8899/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
