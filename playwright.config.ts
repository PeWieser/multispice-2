import { defineConfig, devices } from "@playwright/test";

/**
 * MultiSpice E2E (siehe E2E_TESTMATRIX.md). Getestet wird der statische
 * Produktions-Export aus `out/` (identisch zum Cloudflare-Deploy).
 * Lokal: `npm run build && npm run test:e2e`.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false, // ein Server, deterministische Reihenfolge
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }], ["github"]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
    // Zwischenablage/Download-Tests brauchen Berechtigungen (siehe specs).
    contextOptions: { permissions: ["clipboard-read", "clipboard-write"] },
  },
  webServer: {
    command: "node e2e/serve.mjs 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
