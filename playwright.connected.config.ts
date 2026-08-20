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

// Certification guard: this config is the connected-only entry point (npm run
// test:e2e:connected), so it REQUIRES the base connection env. Throwing at config-load
// (the earliest point, before any build/webServer) makes a missing variable fail the run
// with a clear message rather than silently skipping every test. The ordinary demo suite
// (playwright.config.ts / npm run test:e2e) does not load this config and is unaffected.
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "E2E_EMAIL", "E2E_PASSWORD"] as const;
const PLACEHOLDER = /your-project|replace_me|replace_with/i;
const missing = REQUIRED.filter((k) => !process.env[k] || PLACEHOLDER.test(process.env[k] as string));
if (missing.length) {
  throw new Error(
    `Connected certification requires these environment variables (set them; do not skip): ${missing.join(", ")}. ` +
    `Copy .env.e2e.example to .env.e2e.local, fill in the live project URL + publishable key and a seeded operator's ` +
    `email/password, then export them. The ordinary demo suite (npm run test:e2e) is environment-independent and unaffected.`,
  );
}

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
