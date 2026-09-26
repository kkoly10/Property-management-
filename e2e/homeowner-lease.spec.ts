import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const route = "/app/rentals/80000000-0000-4000-8000-000000000008/setup";
for (const width of [320, 390, 1440]) {
  test(`existing signed rental preview fits ${width}px without writes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [], mutations: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (request.method() === "POST") mutations.push(request.url()); });
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Add your existing signed rental" })).toBeVisible();
    await expect(page.getByLabel("Household name", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Upload agreement securely" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save and review rental" })).toBeDisabled();
    await expect(page.getByLabel("First rent charge managed in Crecy", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Opening balance (USD)", { exact: true })).toHaveValue("");
    expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(width + 1);
    expect(errors).toEqual([]); expect(mutations).toEqual([]);
    await mkdir("/tmp/crecy-homeowner-evidence", { recursive: true });
    await page.screenshot({ path: `/tmp/crecy-homeowner-evidence/lease-${width}.png`, fullPage: true });
  });
}
