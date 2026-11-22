import { expect, test } from "@playwright/test";

const UNIT = "80000000-0000-4000-8000-000000000008";
const PUBLIC_ID = "81000000-0000-4000-8000-000000000081";

for (const width of [390, 1440]) {
  test(`shareable listing setup fits ${width}px without enabling discovery`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/app/rentals/${UNIT}/listing`);
    await expect(page.getByRole("heading", { name: /Find a renter without waiting for marketplace traffic/i })).toBeVisible();
    await expect(page.getByText("Marketplace discovery is deliberately off", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test("unlisted public preview exposes coarse listing data but no private address", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/l/${PUBLIC_ID}`);
  await expect(page.getByRole("heading", { name: "Private basement apartment" })).toBeVisible();
  await expect(page.getByText("$1,350", { exact: true })).toBeVisible();
  await expect(page.getByText("Example City, VA, US")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("123 Example Street");
  await expect(page.locator("body")).not.toContainText("22030");
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  expect(robots).toMatch(/noindex/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("unknown share ids fail closed instead of exposing a listing shell", async ({ page }) => {
  const response = await page.goto("/l/82000000-0000-4000-8000-000000000082");
  expect(response?.status()).toBe(404);
});
