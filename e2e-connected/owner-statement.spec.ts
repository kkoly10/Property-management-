import { test, expect } from "@playwright/test";

// Connected-mode E2E — owner statement (operator finalizes a snapshot from real ledger
// postings; owner sees it in Crecy Owner). finalize_owner_statement snapshots existing
// journal_entries (revenue/expense legs carrying property_id) — it posts no journal.
// Fixture (seeded out of band): owner_entity + ownership_interest (fraction 1.0), org plan
// with the owner-portal entitlement, and an active owner_entity relationship for the owner user.
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL;
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD;
const OWNER_ENTITY = process.env.E2E_OWNER_ENTITY_ID;
const PROPERTY = process.env.E2E_PROPERTY_ID;
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && EMAIL && PASSWORD && OWNER_ENTITY && PROPERTY);
test.skip(!CONFIGURED, "Set connected env + E2E_OWNER_ENTITY_ID + E2E_PROPERTY_ID to run this leg.");

test.describe.configure({ mode: "serial" });

async function signIn(page: import("@playwright/test").Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("operator calculates and finalizes an owner statement from real postings", async ({ page }) => {
  await signIn(page, EMAIL!, PASSWORD!, `/app/owner-statements/${OWNER_ENTITY}?propertyId=${PROPERTY}`);
  await page.waitForURL(new RegExp(`/app/owner-statements/${OWNER_ENTITY}`), { timeout: 30_000 });

  await page.locator("#period-start").fill("2026-08-01");
  await page.locator("#period-end").fill("2026-09-30");
  await page.getByRole("button", { name: /Recalculate/i }).click();

  // Draft appears with the hash-verified badge and the net owner position from the ledger.
  await expect(page.getByText(/Hash verified/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Net owner position/i)).toBeVisible();

  await page.getByRole("button", { name: /Finalize immutable snapshot/i }).click();
  await expect(page.getByText(/Statement finalized/i)).toBeVisible({ timeout: 30_000 });
});

test("owner sees the finalized statement in Crecy Owner", async ({ page }) => {
  test.skip(!(OWNER_EMAIL && OWNER_PASSWORD), "Set E2E_OWNER_EMAIL + E2E_OWNER_PASSWORD for the owner portal leg.");
  await signIn(page, OWNER_EMAIL!, OWNER_PASSWORD!, "/owner");
  await page.goto("/owner");
  await expect(page.getByRole("heading", { name: /Property performance/i })).toBeVisible();
  await expect(page.getByText(/Owner portal preview/i)).toHaveCount(0);
  await expect(page.getByText(/Finalized ·/i).first()).toBeVisible();
  await expect(page.getByText(/Net owner position/i).first()).toBeVisible();
});
