import { test, expect } from "@playwright/test";

// Connected-mode E2E — lease activation leg (browser run 2 of the deep sequence).
// Assumes an operator with an org + property, plus a seeded active unit and a
// scanned-clean signed-lease document (cleaned by the real scan worker, out of
// band). Drives the real `activate_existing_lease` command through the UI wizard.
//
// Self-skips unless the connection env + seeded operator are provided.
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && EMAIL && PASSWORD);
test.skip(!CONFIGURED, "Set the connected env to run this leg.");

const today = new Date().toISOString().slice(0, 10);

test("operator activates an existing lease through the wizard", async ({ page }) => {
  await page.goto("/login?next=%2Fapp%2Fleases%2Frecord");
  await page.locator("#email").fill(EMAIL!);
  await page.locator("#password").fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app\/leases\/record/, { timeout: 30_000 });

  // 01 · Home — the seeded property/unit populate the selects (index 0 is the placeholder).
  await page.locator("#lease-property").selectOption({ index: 1 });
  await page.locator("#lease-unit").selectOption({ index: 1 });

  // 02 · Household — member 1 is the primary contact by default.
  await page.locator("#household-name").fill("Rivera household");
  await page.locator("#first-primary").fill("Riley");
  await page.locator("#last-primary").fill("Rivera");

  // 03 · Lease terms + the scanned-clean signed document.
  await page.locator("#start-date").fill(today);
  await page.locator("#rent-amount").fill("1500.00");
  await page.locator("#signed-document").selectOption({ index: 1 });

  // 04 · Activate — set the first recurring charge to today, then Review -> Confirm.
  await page.locator("#first-charge").fill(today);
  const submit = page.getByRole("button", { name: /review tenancy|confirm and activate tenancy/i });
  await expect(submit).toBeEnabled();
  await submit.click(); // Review
  await page.getByRole("button", { name: /confirm and activate tenancy/i }).click(); // Activate

  await expect(page.getByText(/Tenancy activated/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Tenancy [0-9a-f-]{36}/i)).toBeVisible();
});
