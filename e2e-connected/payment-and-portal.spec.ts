import { test, expect } from "@playwright/test";

// Connected-mode E2E — payment + resident portal leg (browser run 3, the deep proof).
// Operator records a manual payment against a seeded open rent charge through the real
// UI wizard (posting a balanced double-entry journal + immutable receipt), then the
// resident signs in and sees that payment in Crecy Living — the operator->resident round trip.
//
// Preconditions (seeded out of band): an active tenancy with one OPEN rent charge, the org
// evidence threshold raised above the payment amount, and an active resident relationship
// for E2E_RESIDENT_EMAIL. Self-skips without the connection env.
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const RES_EMAIL = process.env.E2E_RESIDENT_EMAIL;
const RES_PASSWORD = process.env.E2E_RESIDENT_PASSWORD;
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && EMAIL && PASSWORD);
test.skip(!CONFIGURED, "Set the connected env to run this leg.");

test.describe.configure({ mode: "serial" });

async function signIn(page: import("@playwright/test").Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("operator records a manual payment against the open charge", async ({ page }) => {
  await signIn(page, EMAIL!, PASSWORD!, "/app/payments/record");
  await page.waitForURL(/\/app\/payments\/record/, { timeout: 30_000 });

  // Select the (only) tenancy; index 0 is the disabled placeholder.
  await page.locator("#payment-tenancy").selectOption({ index: 1 });

  // Read the open charge's remaining amount from its card, then pay it in full.
  const remainingText = await page.getByText(/remaining/i).first().innerText();
  const match = remainingText.match(/\$([\d,]+\.\d{2})/);
  expect(match, `could not parse remaining from "${remainingText}"`).toBeTruthy();
  const amount = match![1].replace(/,/g, "");

  await page.locator("#payment-amount").fill(amount);
  await page.locator("#payment-reason").fill("Cash receipt at the leasing office (E2E)");
  await page.locator('input[id^="allocation-"]').first().fill(amount);

  const submit = page.getByRole("button", { name: /review payment|confirm and record payment/i });
  await expect(submit).toBeEnabled();
  await submit.click(); // Review
  await page.getByRole("button", { name: /confirm and record payment/i }).click(); // Record

  await expect(page.getByText(/Payment recorded/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: /Open receipt/i })).toBeVisible();
});

test("resident sees their home and the operator-posted payment in Crecy Living", async ({ page }) => {
  test.skip(!(RES_EMAIL && RES_PASSWORD), "Set E2E_RESIDENT_EMAIL + E2E_RESIDENT_PASSWORD for the portal leg.");
  await signIn(page, RES_EMAIL!, RES_PASSWORD!, "/home");
  await page.goto("/home");

  await expect(page.getByRole("heading", { name: /Welcome home/i })).toBeVisible();
  // The resident's real home (seeded property + unit), not the preview sample.
  await expect(page.getByText(/Unit E2E-101/i)).toBeVisible();
  await expect(page.getByText(/Resident preview/i)).toHaveCount(0);
  // The payment the operator just posted shows in payment history with a receipt.
  await expect(page.getByRole("heading", { name: /Payment history/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Receipt/i }).first()).toBeVisible();
});
