import { defineConfig } from "@playwright/test";

/**
 * Story 1.4 — Playwright E2E configuration (Chromium only, Sauce Demo).
 * E2E stays out of `npm run verify`: Sauce Demo is an external public SUT.
 * Deliberate-failure demo is env-gated (E2E_DEMO_FAILURE=true) and never
 * active during normal runs.
 *
 * Note: testIdAttribute is intentionally NOT customized. Playwright's
 * default getByTestId matches `data-testid` (lowercase, no dash), while
 * Sauce Demo uses `data-test`. All suite locators therefore use explicit
 * CSS `[data-test='...']` selectors or roles — never getByTestId.
 */
export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  retries: 0,
  reporter: [["html", { outputFolder: "../../playwright-report" }], ["list"]],
  outputDir: "../../test-results",
  timeout: 60 * 1000,
  expect: {
    timeout: 15 * 1000,
  },
  use: {
    baseURL: "https://www.saucedemo.com",
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15 * 1000,
    navigationTimeout: 30 * 1000,
  },
  projects: [{ name: "chromium" }],
});
