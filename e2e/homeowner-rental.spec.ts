import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

for (const width of [320, 390, 1440]) {
  test(`private homeowner setup is usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/app/rentals/new");
    await expect(page.getByRole("heading", { name: "Tell us about your rental" })).toBeVisible();
    await expect(page.getByLabel("Street address", { exact: true })).toBeVisible();
    await expect(page.getByLabel("kitchen access")).toBeAttached();
    await expect(page.getByRole("button", { name: "Review rental setup" })).toBeDisabled();
    await expect(page.getByText("Setup preview.", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    await mkdir("/tmp/crecy-homeowner-evidence", { recursive: true });
    await page.screenshot({ path: `/tmp/crecy-homeowner-evidence/setup-${width}.png`, fullPage: true });
  });
}
test("the homeowner empty state links to setup without publishing a listing", async ({ page }) => {
  await page.goto("/app/rentals");
  await expect(page.getByRole("heading", { name: "Your rentals, in one place" })).toBeVisible();
  await page.getByRole("link", { name: "Add a rental", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/rentals\/new$/);
  await expect(page.getByText("Your address stays private", { exact: false })).toBeVisible();
});
