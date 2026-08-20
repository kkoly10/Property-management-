import { test, expect } from "@playwright/test";

// Connected-mode E2E — runs the real app against a LIVE Supabase project.
// Unlike the demo smoke suite, this exercises the full stack: browser -> server action
// -> auth.signInWithPassword -> command RPCs -> RLS -> ledger/audit -> render.
//
// It self-skips unless the connection env + a seeded confirmed test user are provided
// (see playwright.connected.config.ts and .env.e2e.example), so it is inert by default.

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && EMAIL && PASSWORD);

test.skip(!CONFIGURED, "Set NEXT_PUBLIC_SUPABASE_URL + E2E_EMAIL + E2E_PASSWORD to run the connected suite.");

// One workspace per run so re-runs never collide on the unique org slug.
const RUN = String(Date.now()).slice(-9);
const ORG_NAME = `Crecy E2E ${RUN}`;
const ORG_SLUG = `crecy-e2e-${RUN}`;
const PROPERTY_NAME = `E2E Maple Court ${RUN}`;

test.describe.configure({ mode: "serial" });

async function signIn(page: import("@playwright/test").Page, next = "/app") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator("#email").fill(EMAIL!);
  await page.locator("#password").fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("unauthenticated operator route redirects to the real login", async ({ page }) => {
  const response = await page.goto("/app");
  expect(response!.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/login\?next=%2Fapp/);
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("login + onboarding provisions a live tenant and the dashboard reads it back", async ({ page }) => {
  await test.step("sign in through the UI", async () => {
    await signIn(page, "/app");
  });

  await test.step("create the organization", async () => {
    await page.goto("/onboarding/organization");
    await page.locator("#displayName").fill(ORG_NAME);
    await page.locator("#slug").fill(ORG_SLUG);
    await page.locator('input[name="acceptedTerms"]').check();
    await page.getByRole("button", { name: /create crecy workspace/i }).click();
    await page.waitForURL(/\/onboarding\/entity/, { timeout: 30_000 });
  });

  await test.step("create the operating entity + accounting book", async () => {
    await page.locator("#legalName").fill(`Crecy E2E Management LLC ${RUN}`);
    await page.locator("#displayName").fill(`Crecy E2E PM ${RUN}`);
    await page.locator("#bookName").fill(`E2E operating book ${RUN}`);
    // entityType=company, countryCode=US, currencyCode=USD defaults satisfy the schema.
    await page.getByRole("button", { name: /create entity and book/i }).click();
    await page.waitForURL(/\/onboarding\/property/, { timeout: 30_000 });
  });

  await test.step("create the first property", async () => {
    // The accounting-book select is server-populated with the just-created book.
    await expect(page.locator("#accountingBookId option")).not.toHaveCount(0);
    await page.locator("#name").fill(PROPERTY_NAME);
    await page.locator("#addressLine1").fill("100 Maple Street");
    await page.locator("#locality").fill("Richmond");
    await page.locator("#postalCode").fill("23220");
    await page.getByRole("button", { name: /create property/i }).click();
    await page.waitForURL(/\/app\/properties\/[0-9a-f-]{36}/, { timeout: 30_000 });
  });

  await test.step("the command center reads the tenant back (ready mode, not setup)", async () => {
    await page.goto("/app");
    // The operator shell header renders the real organization display_name.
    await expect(page.getByText(ORG_NAME).first()).toBeVisible();
    // The setup banner only shows when Supabase is NOT connected — it must be absent.
    await expect(page.getByText(/Connect Supabase to activate this workspace/i)).toHaveCount(0);
    // Scope line reflects a real accessible property (unique to the card description;
    // the "All accessible properties" filter option lacks "in the current result").
    await expect(page.getByText(/accessible propert(y|ies) in the current result/i)).toBeVisible();
  });

  await test.step("the property appears in the operator properties workspace", async () => {
    await page.goto("/app/properties");
    await expect(page.getByText(PROPERTY_NAME).first()).toBeVisible();
  });
});
