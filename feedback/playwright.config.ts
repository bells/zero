import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4323",
    channel: process.env.WEBSITE_BROWSER_CHANNEL || "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  outputDir: "output/browser",
  webServer: [
    {
      command: "pnpm start",
      url: "http://127.0.0.1:4323",
      env: {
        FEEDBACK_ENV: "local",
        FEEDBACK_DEMO: "1",
        DATABASE_URL: "",
        FEEDBACK_LOCAL_DATA: "",
        FEEDBACK_ORIGIN: "http://127.0.0.1:4323",
        FEEDBACK_PARENT_ORIGINS: "http://127.0.0.1:4321",
        FEEDBACK_WRITES_PAUSED: "0",
        FEEDBACK_DAILY_WRITE_BUDGET: "100",
        FEEDBACK_JWT_SECRET: "synthetic-browser-jwt-secret-000000000000",
        FEEDBACK_SOURCE_SALT: "synthetic-browser-source-salt-0000000000",
      },
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "node --experimental-strip-types tests/fixture-site.ts",
      url: "http://127.0.0.1:4321/feedback-review/tools/",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
