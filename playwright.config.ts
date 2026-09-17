import { defineConfig } from "@playwright/test";

import { existsSync } from "node:fs";

/**
 * The container image this repo is developed in ships a preinstalled Chromium at a fixed path. A
 * laptop has no such file and uses Playwright's own managed download instead. Pinning the container
 * path unconditionally is fine while the suite is run by hand, but `npm run check` now runs it, so
 * an unconditional path would fail the gate on every machine that is not this container. Use the
 * preinstalled binary when it is actually present, and otherwise let Playwright resolve its own.
 */
const preinstalledChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const launchOptions = existsSync(preinstalledChromium) ? { executablePath: preinstalledChromium } : {};

// E2E smoke suite. Runs the production build in demo/setup mode (no Supabase env),
// which renders every page with preview data — so the whole UI is exercisable
// without a backend or auth. Chromium is the pre-installed browser in this env.
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    screenshot: "only-on-failure",
    trace: "off",
    launchOptions,
  },
  webServer: {
    // The demo harness is not a production deployment. Saying so keeps the legal fail-closed gate
    // honest: it stays strict everywhere that has not explicitly declared otherwise.
    env: { CRECY_DEPLOYMENT_ENV: "test" },
    command: "npx next start -p 3100 -H 127.0.0.1",
    url: "http://127.0.0.1:3100/login",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
