const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.cjs",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:4174",
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
});
