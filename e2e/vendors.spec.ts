import { expect, test, type Page } from "@playwright/test";

/**
 * The operator vendor surface, in demo mode.
 *
 * What this suite is for is the shape of the journey rather than its wiring: the maintenance screen
 * has to OFFER vendor creation where the vendor is chosen, the directory has to lead somewhere, and
 * the management screen has to be a real, labelled form at phone width. The behaviour behind those
 * affordances — draft preservation, selection, focus return, the idempotency-key lifecycle — is
 * proven in src/app/app/maintenance/[requestId]/assign-vendor-form.test.tsx, where it can be driven
 * without a backend; demo mode renders these controls disabled, so it cannot prove them here.
 */
const PREVIEW_REQUEST = "/app/maintenance/a0000000-0000-4000-8000-000000000001";
const PREVIEW_VENDOR = "/app/vendors/b0000000-0000-4000-8000-000000000001";
const WIDTHS = [390, 768, 1024, 1440];

async function assertNoHorizontalOverflow(page: Page, path: string, width: number) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    if (overflow <= 1) return { overflow, culprit: null as string | null };
    let culprit: string | null = null;
    let widest = 0;
    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const rect = element.getBoundingClientRect();
      if (rect.right > doc.clientWidth + 1 && rect.width > widest) {
        widest = rect.width;
        culprit = `${element.tagName.toLowerCase()}.${element.className?.toString().slice(0, 80)}`;
      }
    }
    return { overflow, culprit };
  });
  expect(
    result.overflow,
    `${path} at ${width}px overflows horizontally by ${result.overflow}px (widest offender: ${result.culprit ?? "unknown"})`,
  ).toBeLessThanOrEqual(1);
}

test.describe("operator vendor surface", () => {
  test("a maintenance request offers vendor creation where the vendor is chosen", async ({ page }) => {
    await page.goto(PREVIEW_REQUEST);
    // The dead end this replaces was a sentence. The affordance has to sit with the field it serves,
    // so that reaching it never costs the half-filled work order beside it.
    await expect(page.getByLabel("Vendor")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Add vendor$/ })).toBeVisible();
  });

  test("the directory leads to a vendor and the vendor leads back", async ({ page }) => {
    await page.goto("/app/vendors");
    await page.getByRole("link", { name: /Ready Fix Plumbing/ }).click();
    await expect(page).toHaveURL(new RegExp(`${PREVIEW_VENDOR}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Ready Fix Plumbing" })).toBeVisible();
    await page.getByRole("link", { name: "Vendors" }).first().click();
    await expect(page).toHaveURL(/\/app\/vendors$/);
  });

  test("the management form is labelled and offers archiving rather than deletion", async ({ page }) => {
    await page.goto(PREVIEW_VENDOR);
    for (const label of ["Name", /^Email/, /^Phone/, "Status"]) {
      await expect(page.getByLabel(label), `no labelled control for ${label}`).toBeVisible();
    }
    await expect(page.getByLabel("Status")).toHaveAccessibleDescription(/Only active vendors/);
    await expect(page.getByRole("button", { name: /Archive vendor/ })).toBeVisible();
    // Nothing here destroys a vendor: work orders reference them by id and must keep naming them.
    await expect(page.getByRole("button", { name: /^Delete/ })).toHaveCount(0);
  });

  for (const width of WIDTHS) {
    test(`the vendor surfaces fit a ${width}px viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/app/vendors", PREVIEW_VENDOR, PREVIEW_REQUEST]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await assertNoHorizontalOverflow(page, path, width);
      }
    });
  }
});
