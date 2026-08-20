import { test, expect } from "@playwright/test";

// Connected-mode E2E — platform support console AAL2 step-up gate (correction D).
//
// Tagged @external: it needs a seeded platform actor (out-of-band, like Stripe/email fixtures), and the
// happy path (actually opening a support session) additionally needs an MFA/TOTP-enrolled actor at AAL2,
// which this suite deliberately does not provision. What IS certifiable without any TOTP secret is the
// STEP-UP GATE: a platform actor arriving at a diagnostics page while still at AAL1 must be routed
// through the existing MFA flow (a "Verify with MFA" affordance that returns to /platform), never shown
// the start-session form. That is exactly what this leg asserts.
//
// The DB gate itself (start_support_session raising MFA_STEP_UP_REQUIRED at AAL1) is proven exhaustively
// by the embedded-Postgres suite; this leg proves the browser wiring that fronts it.

const EMAIL = process.env.E2E_PLATFORM_EMAIL;
const PASSWORD = process.env.E2E_PLATFORM_PASSWORD;
const ORG = process.env.E2E_ORG_ID;
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && EMAIL && PASSWORD && ORG);

test.describe.configure({ mode: "serial" });

test(
  "platform actor at AAL1 is routed to MFA step-up before any support session @external",
  async ({ page }) => {
    test.skip(!CONFIGURED, "Set E2E_PLATFORM_EMAIL + E2E_PLATFORM_PASSWORD (a seeded platform actor) + E2E_ORG_ID to run the platform step-up leg.");

    await test.step("sign in as the platform actor", async () => {
      await page.goto(`/login?next=${encodeURIComponent(`/platform/${ORG}`)}`);
      await page.locator("#email").fill(EMAIL!);
      await page.locator("#password").fill(PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
    });

    await test.step("the diagnostics page gates the session behind MFA step-up", async () => {
      await page.goto(`/platform/${ORG}`);
      // A platform actor with no elevated (AAL2) session sees the step-up affordance, not the form.
      const stepUp = page.getByRole("link", { name: /verify with mfa/i });
      await expect(stepUp).toBeVisible();
      await expect(stepUp).toHaveAttribute("href", new RegExp(`/settings/security/mfa\\?returnTo=${encodeURIComponent(`/platform/${ORG}`)}`));
      // The start-session form must NOT be reachable while unverified.
      await expect(page.getByRole("button", { name: /open audited support session/i })).toHaveCount(0);
    });

    await test.step("following the affordance lands on the shared MFA step-up flow", async () => {
      await page.getByRole("link", { name: /verify with mfa/i }).click();
      await page.waitForURL(/\/settings\/security\/mfa/, { timeout: 30_000 });
      await expect(page.getByText(/security check/i)).toBeVisible();
    });
  },
);
