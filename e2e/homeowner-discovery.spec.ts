import { expect, test } from "@playwright/test";

const DISCOVERABLE = "83000000-0000-4000-8000-000000000083";
const UNLISTED = "81000000-0000-4000-8000-000000000081";

for (const width of [390, 1440]) {
  test(`Crecy rental discovery fits ${width}px and reuses the listing pipeline`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/search");

    await expect(page.getByRole("heading", { name: /Find a rental/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Garden-level apartment" })).toBeVisible();
    await expect(page.getByText("Example City, VA, US")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("123 Example Street");
    await expect(page.locator("body")).not.toContainText("22030");
    await expect(page.getByRole("link", { name: /Garden-level apartment/i })).toHaveAttribute(
      "href", `/l/${DISCOVERABLE}`,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);
  });
}

test("discovery filters fail closed without exposing unlisted share links", async ({ page }) => {
  await page.goto("/search?country=CA");
  await expect(page.getByRole("heading", { name: "No matching rentals" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(UNLISTED);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
});

test("a discoverable search result opens the same inquiry-tour-application listing surface", async ({ page }) => {
  await page.goto(`/l/${DISCOVERABLE}`);

  await expect(page.getByText("Rental on Crecy")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Garden-level apartment" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Send the landlord a verified question/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Request a verified tour/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Apply for this rental/i })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("123 Example Street");
});
