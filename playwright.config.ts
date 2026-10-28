import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running CultureCrash server (dev or `next start`).
 * Local runs use AUTH_MODE=local + local Postgres; see README "Testing".
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure", viewport: { width: 1440, height: 950 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 950 } } }],
});
