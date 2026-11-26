'use strict';

const { defineConfig } = require('@playwright/test');
const { resolve } = require('node:path');

module.exports = defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'exec python3 -m http.server 4173 --bind 127.0.0.1 --directory docs',
    url: 'http://127.0.0.1:4173',
    cwd: resolve(__dirname, '../..'),
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
