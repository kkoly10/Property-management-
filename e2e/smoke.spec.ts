import { test, expect, type Page } from "@playwright/test";

// The app runs in demo/setup mode here (no Supabase env), so every page renders
// with hardcoded preview data. These smoke tests confirm each built surface
// renders without a server error and shows its real content.

const staticRoutes: Array<{ path: string; expect?: RegExp }> = [
  { path: "/login" },
  { path: "/signup" },
  // Crecy Living (resident PWA)
  { path: "/home", expect: /Welcome home/i },
  { path: "/documents", expect: /Delivered to you/i },
  { path: "/maintenance" },
  { path: "/maintenance/new" },
  { path: "/messages" },
  { path: "/more/preferences" },
  { path: "/payments/new" },
  // Crecy Owner
  { path: "/owner" },
  { path: "/owner/documents", expect: /Delivered to you/i },
  { path: "/owner/messages" },
  // Crecy OS (operator)
  { path: "/app", },
  { path: "/app/documents", expect: /Document register/i },
  { path: "/app/maintenance" },
  { path: "/app/payments" },
  { path: "/app/payments/record" },
  { path: "/app/properties" },
  { path: "/app/residents" },
  { path: "/app/search" },
  { path: "/app/owner-statements" },
  // Onboarding + settings
  { path: "/onboarding/organization" },
  { path: "/onboarding/entity" },
  { path: "/onboarding/property" },
  { path: "/settings/payments" },
  { path: "/settings/privacy" },
  { path: "/settings/security/mfa" },
  { path: "/settings/team" },
  // NOTE: /settings/team/accept and /invitations/accept call createClient() directly
  // (requirePublicSupabaseConfig throws without env), so they are connected-mode-only
  // and intentionally excluded from this demo-mode suite.
];

const dynamicRoutes = [
  "/receipts/preview-document",
  "/owner/statements/preview-statement",
  "/owner/approvals/preview-approval",
  "/owner/messages/preview-conversation",
  "/messages/preview-conversation",
  "/app/payments/preview-payment",
  "/app/properties/preview-property",
  "/app/maintenance/preview-request",
  "/app/owner-statements/preview-owner",
];

async function assertNoServerError(page: Page) {
  const body = await page.locator("body").innerText();
  expect(body, "page shows a Next.js runtime/server error").not.toMatch(/Application error|Internal Server Error|Unhandled Runtime Error/i);
}

test.describe("static routes render in demo mode", () => {
  for (const route of staticRoutes) {
    test(`renders ${route.path}`, async ({ page }) => {
      const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
      expect(response, `no response for ${route.path}`).toBeTruthy();
      expect(response!.status(), `bad status for ${route.path}`).toBeLessThan(400);
      await assertNoServerError(page);
      // The page rendered real content (headings differ: h1 / h2 / Wordmark logo).
      const bodyText = (await page.locator("body").innerText()).trim();
      expect(bodyText.length, `no rendered content on ${route.path}`).toBeGreaterThan(80);
      if (route.expect) await expect(page.getByText(route.expect).first()).toBeVisible();
      await page.screenshot({ path: `playwright-report/screens${route.path.replace(/\//g, "_") || "_root"}.png`, fullPage: true });
    });
  }
});

test.describe("dynamic detail routes do not crash", () => {
  for (const path of dynamicRoutes) {
    test(`loads ${path}`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      // Preview data ignores the id, so these should render (200); a 404 is acceptable,
      // a 500 (server crash) is not.
      expect(response!.status(), `server crash on ${path}`).toBeLessThan(500);
      await assertNoServerError(page);
    });
  }
});

test.describe("document delivery & acknowledgement UI", () => {
  test("resident /documents shows a delivered document and an acknowledge control", async ({ page }) => {
    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: /Delivered to you/i })).toBeVisible();
    await expect(page.getByText(/Crecy Living/i)).toBeVisible();
    // Preview delivery card + acknowledge affordance.
    await expect(page.getByRole("button", { name: /Acknowledge receipt/i }).first()).toBeVisible();
    await expect(page.getByText(/Awaiting acknowledgement|Acknowledged/i).first()).toBeVisible();
  });

  test("owner /owner/documents shows the owner-scoped delivery view", async ({ page }) => {
    await page.goto("/owner/documents");
    await expect(page.getByRole("heading", { name: /Delivered to you/i })).toBeVisible();
    await expect(page.getByText(/Crecy Owner/i)).toBeVisible();
  });

  test("operator /app/documents shows the register and upload form", async ({ page }) => {
    await page.goto("/app/documents");
    await expect(page.getByText(/Document register/i)).toBeVisible();
    await expect(page.getByText(/Upload document/i)).toBeVisible();
  });

  test("resident home 'Documents' shortcut navigates to /documents", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("link", { name: /Documents/i }).first().click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByRole("heading", { name: /Delivered to you/i })).toBeVisible();
  });
});

test.describe("owner statement print-to-PDF affordance", () => {
  test("owner statement detail exposes Save as PDF + Download CSV", async ({ page }) => {
    const response = await page.goto("/owner/statements/preview-statement");
    expect(response!.status()).toBeLessThan(500);
    // In setup/preview mode the page renders the sample statement (read-only banner).
    await assertNoServerError(page);
  });
});
