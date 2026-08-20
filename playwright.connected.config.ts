import { defineConfig } from "@playwright/test";

// Connected-mode E2E: drives the REAL app against a live Supabase project
// (auth + RPCs + RLS + ledger), unlike the demo-mode smoke suite (playwright.config.ts).
//
// It only runs when the connection env is present — see e2e-connected/*.spec.ts, which
// test.skip() themselves when these are unset, so this config is a no-op without secrets.
//
// Required env (never commit real values; see .env.e2e.example):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (also needed at BUILD
//     time — client bundles inline NEXT_PUBLIC_* — so `next build` must see them too)
//   E2E_EMAIL, E2E_PASSWORD  — a confirmed auth user seeded in that project
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export default defineConfig({
  testDir: "./e2e-connected",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-connected" }]],
  use: {
    baseURL: "http://127.0.0.1:3200",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  },
  webServer: {
    command: "npx next start -p 3200 -H 127.0.0.1",
    url: "http://127.0.0.1:3200/login",
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3200",
    },
  },
});
