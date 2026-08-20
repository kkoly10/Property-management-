import { test, expect } from "@playwright/test";

// Connected-mode E2E — receivable write-off + payment correction (both post reversing journals).
// Driven through the operator UI (the ledger tables are insert-revoked from browser roles, so
// these must run through their real commands). Fixture: one OPEN charge (to write off) and one
// succeeded MANUAL payment (to correct/reverse). Payment id passed via env.
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const PAYMENT = process.env.E2E_PAYMENT_ID;
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && EMAIL && PASSWORD);
test.skip(!CONFIGURED, "Set the connected env to run this leg.");

test.describe.configure({ mode: "serial" });

async function signIn(page: import("@playwright/test").Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator("#email").fill(EMAIL!);
  await page.locator("#password").fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("operator writes off the uncollectible September charge (6300 DR / 1100 CR)", async ({ page }) => {
  await signIn(page, "/app/payments");
  await page.waitForURL(/\/app\/payments/, { timeout: 30_000 });
  await page.getByRole("button", { name: /Write off uncollectible/i }).click();
  // Target the September charge specifically (its due date is in the row label).
  await page.locator('label:has-text("2026-09-20") input[type="checkbox"]').check();
  await page.locator('textarea[id^="writeoff-reason-"]').fill("Resident vacated; September balance uncollectible (E2E)");
  await page.getByRole("button", { name: /^Write off$/ }).click();
  await expect(page.getByText(/Wrote off/i)).toBeVisible({ timeout: 30_000 });
});

test("operator reverses the mistaken manual payment (reversal journal)", async ({ page }) => {
  test.skip(!PAYMENT, "Set E2E_PAYMENT_ID for the correction leg.");
  await signIn(page, `/app/payments/${PAYMENT}`);
  await page.waitForURL(new RegExp(`/app/payments/${PAYMENT}`), { timeout: 30_000 });
  await page.locator("#correction-type").selectOption("reversal");
  await page.locator("#correction-reason").fill("Receipt entered against the wrong tenancy (E2E)");
  await page.getByRole("button", { name: /Review correction/i }).click();
  await page.getByRole("button", { name: /Confirm and post correction/i }).click();
  await expect(page.getByText(/Correction posted/i)).toBeVisible({ timeout: 30_000 });
});
