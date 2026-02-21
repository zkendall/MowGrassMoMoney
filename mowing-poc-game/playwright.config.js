const { defineConfig } = require('playwright/test');

const baseURL = process.env.MOWING_BASE_URL || 'http://127.0.0.1:4173';
const parsedBaseURL = new URL(baseURL);
const isLocalHost = ['127.0.0.1', 'localhost'].includes(parsedBaseURL.hostname);
const port = parsedBaseURL.port || '4173';
const disableWebServer = process.env.MOWING_DISABLE_WEBSERVER === '1';

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.js'],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 6_000,
  },
  outputDir: 'output/test-results',
  reporter: process.env.CI
    ? [
      ['list'],
      ['json', { outputFile: 'output/playwright-report.json' }],
    ]
    : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: disableWebServer || !isLocalHost
    ? undefined
    : {
      command: `python3 -m http.server ${port} --directory .`,
      url: baseURL,
      cwd: __dirname,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
});
