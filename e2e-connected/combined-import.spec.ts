import { expect, test } from "@playwright/test";

/**
 * Connected certification for the single-pass combined import.
 *
 * Drives the real browser against a live Supabase project: pick the leg, map the columns, validate,
 * commit — then assert the operator is told what was actually created. The DB postconditions (balanced
 * 1100/3900 journal, armed rent schedule) are asserted out of band after the run.
 *
 * Requires a seeded organization whose source document has been cleaned by the real scan lifecycle
 * (finalize -> claim_document_scan_jobs -> complete_document_scan). Since v4.2 Batch A1 that lifecycle
 * exists, so the source must be cleaned by running the scan worker against a configured scan relay —
 * a manual upload_status edit is not a valid substitute (file 27 §5.A1).
 *
 * The fixture must be FRESH — a source whose units have not already been imported. Re-running against
 * a consumed source correctly fails validation with TENANCY_OVERLAP, because a unit cannot hold two
 * overlapping tenancies; that is the product working, not a broken test, so this spec names that cause
 * explicitly rather than timing out on a button that will never enable.
 */
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const SOURCE_TITLE = process.env.E2E_IMPORT_SOURCE_TITLE;
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && EMAIL && PASSWORD && SOURCE_TITLE);

test.skip(!CONFIGURED, "Set connected env + E2E_IMPORT_SOURCE_TITLE (a scanned-clean CSV in the org) to run this leg.");
test.describe.configure({ mode: "serial" });

// Maps the fixture CSV's headers onto the combined leg's canonical fields.
const MAPPING: Record<string, string> = {
  propertyName: "Property", propertyType: "Type", addressLine1: "Address", locality: "City",
  subdivisionCode: "State", postalCode: "Postal", countryCode: "Country", timeZone: "TZ",
  unitCode: "Unit", unitType: "UnitType", bedrooms: "Beds", bathrooms: "Baths", squareFeet: "Sqft",
  primaryFirstName: "First", primaryLastName: "Last", primaryEmail: "Email",
  leaseStartDate: "Start", rentAmountMinor: "Rent", rentFrequency: "Freq",
  currencyCode: "Currency", openingBalanceMinor: "Opening",
};

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login?next=%2Fapp");
  await page.locator("#email").fill(EMAIL!);
  await page.locator("#password").fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("an operator imports an occupied portfolio from one file, end to end", async ({ page }) => {
  await signIn(page);

  await test.step("the combined leg is selectable and its source is offered", async () => {
    await page.goto("/app/imports/new");
    await expect(page.locator("#import-type")).toBeEnabled();
    await page.locator("#import-type").selectOption("combined");
    await expect(page.getByText(/One row per occupied unit/i)).toBeVisible();
    // Resolve the option by its rendered text (title — filename), then select by value: Playwright's
    // label matcher takes a literal string, and the label carries a run-specific filename suffix.
    const sourceValue = await page.locator("#source-document option").evaluateAll(
      (nodes, title) => (nodes as HTMLOptionElement[]).find((n) => n.textContent?.includes(title))?.value ?? "",
      SOURCE_TITLE!,
    );
    expect(sourceValue, `no source document option matched "${SOURCE_TITLE}"`).not.toBe("");
    await page.locator("#source-document").selectOption(sourceValue);
    await page.getByRole("button", { name: /start import/i }).click();
    await page.waitForURL(/\/app\/imports\/[0-9a-f-]{36}/, { timeout: 30_000 });
  });

  await test.step("the mapping step offers THIS leg's fields, not the portfolio leg's", async () => {
    // The regression this guards: every leg fell through to the portfolio field list, so the
    // resident/lease columns had no control and validation could only ever fail.
    await expect(page.getByText(/Combined portfolio import/i).first()).toBeVisible();
    for (const key of ["primaryFirstName", "primaryLastName", "leaseStartDate", "rentAmountMinor", "currencyCode"]) {
      await expect(page.locator(`#mapping-${key}`)).toBeVisible();
    }
  });

  await test.step("map every column the leg requires", async () => {
    for (const [key, header] of Object.entries(MAPPING)) {
      const select = page.locator(`#mapping-${key}`);
      if (await select.count()) await select.selectOption(header);
    }
  });

  await test.step("validate the rows", async () => {
    await page.getByRole("button", { name: /validate/i }).click();
    // Report WHAT the operator would see instead of waiting out a button that will never enable. The
    // usual cause of a non-ready run here is a consumed fixture: the units are already tenanted, so
    // every row is correctly rejected as overlapping.
    await expect
      .poll(
        async () => {
          if (await page.getByText(/Validation hash/i).count()) return "ready";
          // The per-row message, not the "Error rows" count card (both are text-destructive).
          const firstRowError = page.locator("p.text-sm.font-medium.text-destructive").first();
          if (await firstRowError.count()) return `row error: ${(await firstRowError.innerText()).trim()}`;
          return "pending";
        },
        { timeout: 30_000, message: "validation did not reach ready — is the source fixture fresh?" },
      )
      .toBe("ready");
    await expect(page.getByRole("button", { name: /commit atomically/i })).toBeEnabled();
  });

  await test.step("commit the batch atomically", async () => {
    await page.getByRole("button", { name: /commit atomically/i }).click();
    await expect(page.getByText(/committed successfully/i)).toBeVisible({ timeout: 45_000 });
  });

  await test.step("the operator is told what was ACTUALLY created, not one leg's shape", async () => {
    await page.reload();
    const summary = page.getByText(/were committed\./i).first();
    await expect(summary).toBeVisible();
    // A combined commit creates all four; a summary hard-coded to the portfolio leg would hide two.
    await expect(summary).toContainText(/propert/i);
    await expect(summary).toContainText(/unit/i);
    await expect(summary).toContainText(/tenanc/i);
    await expect(summary).toContainText(/opening balance/i);
  });

  await test.step("the imported property and units are readable in the operator workspace", async () => {
    await page.goto("/app/properties");
    await expect(page.getByText(/Birch Terrace/i).first()).toBeVisible();
  });
});
