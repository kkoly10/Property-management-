import { expect, test } from "@playwright/test";

/**
 * Import-centre coverage for the demo build.
 *
 * The smoke suite never visited /app/imports, which is how three import legs shipped reachable from
 * the API but not from any control an operator could click. These assertions are specifically about
 * REACH: every implemented leg must be offered, and each must explain what it will do.
 *
 * Demo mode renders the form disabled (no Supabase), but a disabled <select> still exposes its
 * options, so the choice set is verifiable without a backend.
 */
const LEGS = [
  { value: "portfolio", label: /Properties and units/i, hint: /Creates empty properties and units/i },
  { value: "combined", label: /Everything in one file/i, hint: /One row per occupied unit/i },
  { value: "leases", label: /Occupied leases onto imported units/i, hint: /Activates a lease per row/i },
  { value: "residents", label: /Additional residents/i, hint: /Adds co-residents/i },
  { value: "opening_balances", label: /Opening balances/i, hint: /balanced opening receivable/i },
];

test.describe("import centre", () => {
  test("import centre lists jobs and links to a new import", async ({ page }) => {
    await page.goto("/app/imports");
    await expect(page.getByRole("heading", { name: /Import center/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /New import/i }).first()).toBeVisible();
  });

  test("every implemented import leg is offered to the operator", async ({ page }) => {
    await page.goto("/app/imports/new");
    const select = page.locator("#import-type");
    await expect(select).toBeVisible();

    const values = await select.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLOptionElement).value),
    );
    // Exactly the five legs that have a validate/commit pair — no more, no fewer.
    expect(values.sort()).toEqual(["combined", "leases", "opening_balances", "portfolio", "residents"].sort());

    for (const leg of LEGS) {
      await expect(select.locator("option", { hasText: leg.label })).toHaveCount(1);
    }
  });

  test("the selected leg explains what it will actually do", async ({ page }) => {
    // Demo mode renders the form disabled (no Supabase), so the selection cannot be driven here; the
    // default leg's hint is what this build can prove. That every leg HAS copy is asserted as a unit
    // test (create-import-form.test.ts), which does not need a backend.
    await page.goto("/app/imports/new");
    await expect(page.locator("#import-type")).toBeDisabled();
    await expect(page.getByText(LEGS[0].hint)).toBeVisible();
  });

  test("the source picker offers spreadsheets, not CSV only", async ({ page }) => {
    // .xlsx is an accepted source now; copy that still says "CSV" tells the operator otherwise.
    await page.goto("/app/imports/new");
    await expect(page.getByText(/CSV or Excel/i).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Only organization-wide CSV files/i);
  });
});
