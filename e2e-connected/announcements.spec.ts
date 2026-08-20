import { test, expect } from "@playwright/test";

// Connected-mode E2E — announcements (operator publishes -> resident sees it in Crecy Living).
// Publishing fans out announcement_deliveries to matched recipients; the resident reads it on /home.
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const RES_EMAIL = process.env.E2E_RESIDENT_EMAIL;
const RES_PASSWORD = process.env.E2E_RESIDENT_PASSWORD;
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && EMAIL && PASSWORD && RES_EMAIL && RES_PASSWORD);
test.skip(!CONFIGURED, "Set connected env + resident creds to run the announcements leg.");

test.describe.configure({ mode: "serial" });

const TITLE = `Water shutoff notice ${String(Date.now()).slice(-6)}`;
const BODY = "Water will be shut off Saturday 9am-12pm for scheduled maintenance. Please store water in advance.";

async function signIn(page: import("@playwright/test").Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("operator publishes a property-resident announcement", async ({ page }) => {
  await signIn(page, EMAIL!, PASSWORD!, "/app/announcements");
  await page.waitForURL(/\/app\/announcements/, { timeout: 30_000 });
  await page.locator("#announcement-property").selectOption({ index: 0 });
  await page.locator("#announcement-audience").selectOption("property_residents");
  await page.locator("#announcement-title").fill(TITLE);
  await page.locator("#announcement-body").fill(BODY);
  await page.getByRole("button", { name: /Publish announcement/i }).click();
  // The published announcement appears in the history list (title rendered as text, not an input value).
  await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 30_000 });
});

test("resident sees the announcement on the Crecy Living home", async ({ page }) => {
  await signIn(page, RES_EMAIL!, RES_PASSWORD!, "/home");
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: /Announcements/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(TITLE).first()).toBeVisible();
});
