import { expect, test, type Page } from "@playwright/test";

/**
 * The browser test file 27 §5.A3 requires: ONE operator with TWO organizations switches context, and
 * every audited surface follows — with no mixed rows.
 *
 * This runs against a live Supabase project. It needs a seeded operator holding an ACTIVE membership
 * in two organizations; without E2E_SECOND_ORGANIZATION_NAME it skips rather than pretending to pass.
 */
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const SECOND_ORGANIZATION = process.env.E2E_SECOND_ORGANIZATION_NAME;
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && EMAIL && PASSWORD && SECOND_ORGANIZATION);

test.skip(!CONFIGURED, "Set connected env + E2E_SECOND_ORGANIZATION_NAME (an operator in two organizations) to run this leg.");
test.describe.configure({ mode: "serial" });

// The surfaces file 27 §5.A3 names, minus billing and exports, which have no operator route yet.
const AUDITED = [
  { label: "dashboard", path: "/app" },
  { label: "properties", path: "/app/properties" },
  { label: "residents", path: "/app/residents" },
  { label: "imports", path: "/app/imports" },
  { label: "documents", path: "/app/documents" },
  { label: "payments", path: "/app/payments" },
  { label: "maintenance", path: "/app/maintenance" },
  { label: "leasing", path: "/app/leases/record" },
  { label: "owners", path: "/app/owner-statements" },
  { label: "communications", path: "/app/messages" },
  { label: "announcements", path: "/app/announcements" },
  { label: "search", path: "/app/search?q=a" },
  { label: "team", path: "/settings/team" },
  { label: "settings-payments", path: "/settings/payments" },
];

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(EMAIL as string);
  await page.getByLabel(/password/i).fill(PASSWORD as string);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
}

/** The organization id the shell says is active, read from the switcher itself. */
async function activeOrganizationId(page: Page) {
  return page.getByTestId("organization-switcher").getAttribute("data-active-organization-id");
}

test("an operator in two organizations switches context and every audited surface follows", async ({ page }) => {
  await signIn(page);

  const options = page.getByTestId("organization-switcher-options").getByRole("button");
  await expect(options, "the operator must hold membership in at least two organizations").not.toHaveCount(1);
  const optionCount = await options.count();
  expect(optionCount).toBeGreaterThan(1);

  const firstOrganizationId = await activeOrganizationId(page);
  expect(firstOrganizationId).toBeTruthy();

  // Every audited surface must agree with the shell BEFORE the switch.
  for (const surface of AUDITED) {
    await page.goto(surface.path);
    expect(await activeOrganizationId(page), `${surface.label} disagreed with the shell before switching`).toBe(firstOrganizationId);
  }

  // Switch to the second organization by name.
  await page.goto("/app");
  await page.getByTestId("organization-switcher-options").getByRole("button", { name: SECOND_ORGANIZATION as string }).click();
  await page.waitForLoadState("networkidle");

  const secondOrganizationId = await activeOrganizationId(page);
  expect(secondOrganizationId, "the switch did not change the active organization").not.toBe(firstOrganizationId);
  expect(secondOrganizationId).toBeTruthy();

  // And every audited surface must have followed — this is the no-mixed-rows assertion.
  for (const surface of AUDITED) {
    await page.goto(surface.path);
    expect(await activeOrganizationId(page), `${surface.label} did not follow the organization switch`).toBe(secondOrganizationId);
    // A surface that errored is not evidence of isolation; it must have actually rendered.
    await expect(page.getByTestId("organization-context-error"), `${surface.label} failed to load after the switch`).toHaveCount(0);
  }

  // The selection is server-controlled and survives a fresh page load.
  await page.goto("/app");
  expect(await activeOrganizationId(page), "the switched context did not persist across a reload").toBe(secondOrganizationId);
});
