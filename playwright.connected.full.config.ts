import { defineConfig } from "@playwright/test";

// FULL connected certification: `npm run test:e2e:connected:full`.
//
// This is the STRICT counterpart to `npm run test:e2e:connected` (playwright.connected.config.ts).
// The partial run tolerates self-skipped legs when their fixtures are absent — it is a developer
// convenience, NOT a certification, and must never be described as one. This full run is the pilot
// certification: it FAILS unless every required, non-provider-blocked P0 fixture is present, so no
// required leg self-skips, and the certification reporter turns any required skip (or failure) into a
// non-zero exit while reporting specs / executed / passed / failed / skipped / externally-excluded.
//
// Provider-blocked journeys (Stripe payments/refunds/payouts, staff-invitation email, and the platform
// support-session MFA happy path) are the ONLY legitimate exclusions — they need external credentials
// this command deliberately does not require. They are enumerated by the certification reporter, and any
// spec that needs them is tagged @external so its skip is allowed rather than treated as a failure.

// Required for certification: the base connection env PLUS every fixture that gates a required P0 leg.
// Missing any one would make a required leg self-skip, which certification forbids — so fail at config
// load (before build/webServer) with a precise message instead.
const REQUIRED = [
  // Base connection + seeded operator.
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "E2E_EMAIL",
  "E2E_PASSWORD",
  // Resident portal legs (payment-and-portal, document-delivery, maintenance, announcements, messaging).
  "E2E_RESIDENT_EMAIL",
  "E2E_RESIDENT_PASSWORD",
  // Owner portal leg (owner-statement).
  "E2E_OWNER_EMAIL",
  "E2E_OWNER_PASSWORD",
  // Fixture ids seeded out of band for the extended legs.
  "E2E_ORG_ID",
  "E2E_PROPERTY_ID",
  "E2E_DELIVER_VERSION_ID",
  "E2E_RESIDENT_PERSON_ID",
  "E2E_PAYMENT_ID",
  "E2E_OWNER_ENTITY_ID",
  "E2E_CONV_ID",
] as const;
const PLACEHOLDER = /your-project|replace_me|replace_with|0000-0000-0000-0000-000000000000|example\.test/i;
const missing = REQUIRED.filter((key) => !process.env[key] || PLACEHOLDER.test(process.env[key] as string));
if (missing.length) {
  throw new Error(
    `FULL connected certification requires every required P0 fixture (a missing one would self-skip a ` +
      `required leg, which certification forbids). Missing/placeholder: ${missing.join(", ")}. ` +
      `Fill them in from a live out-of-band seed (see .env.e2e.example + CONNECTED_E2E_VERIFICATION_REPORT.md) ` +
      `and export them. Provider-blocked journeys (Stripe, staff email, platform MFA happy path) are ` +
      `intentionally excluded and are NOT required here. For the lenient developer run use ` +
      `npm run test:e2e:connected (playwright.connected.config.ts).`,
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
  // The certification reporter fails the run on any required skip and prints the certification summary.
  reporter: [["list"], ["./playwright.certification-reporter.ts"], ["html", { open: "never", outputFolder: "playwright-report-connected-full" }]],
  use: {
    baseURL: "http://127.0.0.1:3200",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  },
  webServer: {
    // Build with the connected env so the client bundle inlines the live NEXT_PUBLIC_* values, then
    // serve. Certification always runs against a freshly built app, never a stale demo-mode build.
    command: "npx next build && npx next start -p 3200 -H 127.0.0.1",
    url: "http://127.0.0.1:3200/login",
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3200",
    },
  },
});
