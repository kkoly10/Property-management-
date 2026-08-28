import { expect, test } from "@playwright/test";

/**
 * Demo-mode coverage of the operator organization context.
 *
 * The demo build runs with no Supabase env, so the context resolves to `setup` with a single preview
 * organization. What that DOES prove, on every operator route, is that the shell renders the switcher
 * as a real element carrying the active organization — and, crucially, that the switcher shows no
 * options when there is nothing to switch between. Before this slice the same corner held an inert
 * <button> with a chevron that looked like a switcher and did nothing at all.
 *
 * The two-organization switch itself needs real memberships and lives in
 * e2e-connected/organization-switch.spec.ts.
 */
const OPERATOR_ROUTES = [
  "/app",
  "/app/properties",
  "/app/residents",
  "/app/imports",
  "/app/documents",
  "/app/payments",
  "/app/maintenance",
  "/app/messages",
  "/app/announcements",
  "/app/owner-statements",
  "/app/leases/record",
];

test.describe.configure({ mode: "serial" });

test("every operator surface renders the organization switcher in the shell", async ({ page }) => {
  for (const route of OPERATOR_ROUTES) {
    await page.goto(route);
    const switcher = page.getByTestId("organization-switcher");
    await expect(switcher, `${route} did not render the organization switcher`).toBeVisible();
    await expect(page.getByTestId("active-organization-name")).not.toBeEmpty();
  }
});

test("a single organization offers nothing to switch to", async ({ page }) => {
  await page.goto("/app");
  // One organization must not present a choice — automatic selection is only valid when there is
  // nothing to choose between.
  await expect(page.getByTestId("organization-switcher-options")).toHaveCount(0);
});

test("the switcher names the workspace the pages are showing", async ({ page }) => {
  await page.goto("/app");
  const name = (await page.getByTestId("active-organization-name").textContent())?.trim();
  expect(name).toBeTruthy();
  expect(name).not.toBe("Select an organization");
});
