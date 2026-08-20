import { defineConfig } from "@playwright/test";

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
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  },
  webServer: {
    command: "npx next start -p 3100 -H 127.0.0.1",
    url: "http://127.0.0.1:3100/login",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
