import { expect, test } from "@playwright/test";

const UNIT = "80000000-0000-4000-8000-000000000008";
const PUBLIC_ID = "81000000-0000-4000-8000-000000000081";
const TOKEN = "b".repeat(64);

for (const width of [390, 1440]) {
  test(`public verified-tour intake fits ${width}px and stays non-evaluative`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/l/${PUBLIC_ID}`);
    const tourCard = page.getByRole("heading", { name: "Request a verified tour" }).locator("..");
    await expect(tourCard.getByRole("heading", { name: "Request a verified tour" })).toBeVisible();
    await expect(tourCard.getByLabel("First name")).toBeVisible();
    await expect(tourCard.getByLabel("Email")).toBeVisible();
    await expect(tourCard.getByLabel("Preferred time 1")).toBeVisible();
    await expect(tourCard.getByRole("button", { name: "Request a tour" })).toBeVisible();
    await expect(tourCard).toContainText("does not confirm a time");
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);
  });
}

test("opening a tour verification link does not confirm it until explicit action", async ({ page }) => {
  let verifyCalls = 0;
  await page.route("**/api/v1/rental-tours/verify", async (route) => {
    verifyCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ verified: true, tourReference: "TOUR-E2E", status: "requested" }),
    });
  });

  await page.goto(`/tours/verify#token=${TOKEN}`);
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify my email" })).toBeVisible();
  expect(verifyCalls).toBe(0);

  await page.getByRole("button", { name: "Verify my email" }).click();
  await expect(page.getByText("Your tour request is verified")).toBeVisible();
  expect(verifyCalls).toBe(1);
  expect(await page.evaluate(() => window.location.hash)).toBe("");
});

for (const width of [390, 1440]) {
  test(`landlord verified-tour queue fits ${width}px and remains logistics-only`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/app/rentals/${UNIT}/tours`);
    await expect(page.getByRole("heading", { name: "Sample basement apartment" })).toBeVisible();
    await expect(page.getByText("Jamie Visitor")).toBeVisible();
    await expect(page.getByText(/does not approve, rank, or qualify/i)).toBeVisible();
    await expect(page.getByLabel("Private meeting location")).toBeDisabled();
    await expect(page.getByRole("button", { name: /Confirm .*Oct/i }).first()).toBeDisabled();
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);
  });
}
