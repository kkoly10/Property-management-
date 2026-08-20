import { test, expect } from "@playwright/test";

// Connected-mode E2E — maintenance lifecycle end to end against the live project.
// Resident submits a request; operator creates + assigns a work order, drives it through
// accept -> schedule -> start -> complete, then posts the cost (DR 6200 repairs / CR 2000 AP).
// Fixture (seeded out of band): one active vendor + org setting
// work_order_completion_evidence_required='false' (so completion needs no scanned photo).
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const RES_EMAIL = process.env.E2E_RESIDENT_EMAIL;
const RES_PASSWORD = process.env.E2E_RESIDENT_PASSWORD;
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && EMAIL && PASSWORD && RES_EMAIL && RES_PASSWORD);
test.skip(!CONFIGURED, "Set connected env + resident creds to run the maintenance leg.");

test.describe.configure({ mode: "serial" });

const TITLE = "E2E leaky faucet under the kitchen sink";

async function signIn(page: import("@playwright/test").Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("resident submits a maintenance request", async ({ page }) => {
  await signIn(page, RES_EMAIL!, RES_PASSWORD!, "/maintenance/new");
  await page.waitForURL(/\/maintenance\/new/, { timeout: 30_000 });
  await page.locator("#maintenance-home").selectOption({ index: 0 });
  await page.locator("#maintenance-category").selectOption("plumbing");
  await page.locator("#maintenance-title").fill(TITLE);
  await page.locator("#maintenance-description").fill("Water is dripping steadily from the faucet base and pooling in the cabinet.");
  await page.getByRole("button", { name: /Submit request/i }).click();
  // On success the form redirects to the created request detail.
  await page.waitForURL(/\/maintenance\/[0-9a-f-]{36}/, { timeout: 30_000 });
});

test("operator runs the work order to completion and posts cost to the ledger", async ({ page }) => {
  await signIn(page, EMAIL!, PASSWORD!, "/app/maintenance");
  await page.waitForURL(/\/app\/maintenance/, { timeout: 30_000 });
  await page.getByRole("link").filter({ hasText: new RegExp(TITLE, "i") }).first().click();
  await page.waitForURL(/\/app\/maintenance\/[0-9a-f-]{36}/, { timeout: 30_000 });

  // Create + assign the work order.
  await page.locator("#wo-vendor").selectOption({ index: 0 });
  await page.locator("#wo-scope").fill("Replace the faucet cartridge and reseal the supply line.");
  await page.locator("#wo-priority").selectOption("high");
  await page.getByRole("button", { name: /Create work order/i }).click();
  await expect(page.getByText(/Work order .* created/i)).toBeVisible({ timeout: 30_000 });

  // Each transition dead-ends on a success alert (client state), so reload to get the next action.
  async function transition(clickName: RegExp, prep?: () => Promise<void>) {
    await page.reload({ waitUntil: "domcontentloaded" });
    if (prep) await prep();
    await page.getByRole("button", { name: clickName }).click();
    await expect(page.getByText(/Updated to/i)).toBeVisible({ timeout: 30_000 });
  }

  await transition(/Mark vendor accepted/i);
  await transition(/Schedule visit/i, async () => {
    await page.locator("#wo-start").fill("2026-08-21T09:00");
    await page.locator("#wo-end").fill("2026-08-21T11:00");
  });
  await transition(/Mark started/i);
  await transition(/Mark complete/i, async () => {
    await page.locator("#wo-summary").fill("Replaced the cartridge, reseated the supply line, verified no drip.");
  });

  // Work order completed -> post the cost. Reload so RecordCostForm renders.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#wo-cost-amount").fill("250.00");
  await page.locator("#wo-cost-currency").selectOption("USD");
  await page.getByRole("button", { name: /Post cost to ledger/i }).click();
  await expect(page.getByText(/posted|ledger|cost/i).first()).toBeVisible({ timeout: 30_000 });
});
