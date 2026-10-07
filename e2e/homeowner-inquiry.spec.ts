import { expect, test } from "@playwright/test";

const UNIT = "80000000-0000-4000-8000-000000000008";
const PUBLIC_ID = "81000000-0000-4000-8000-000000000081";
const TOKEN = "a".repeat(64);

for (const width of [390, 1440]) {
  test(`public verified-question intake fits ${width}px without marketplace claims`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/l/${PUBLIC_ID}`);
    await expect(page.getByRole("heading", { name: "Send the landlord a verified question" })).toBeVisible();
    await expect(page.getByLabel("First name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Question about this rental")).toBeVisible();
    await expect(page.getByText(/marketplace discovery is not enabled/i)).toBeVisible();
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);
  });
}

test("opening a verification link does not consume it until explicit confirmation", async ({ page }) => {
  let verifyCalls = 0;
  await page.route("**/api/v1/rental-inquiries/verify", async (route) => {
    verifyCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ verified: true, inquiryReference: "INQ-E2E", status: "open" }),
    });
  });

  await page.goto(`/inquiries/verify#token=${TOKEN}`);
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify my email" })).toBeVisible();
  expect(verifyCalls).toBe(0);

  await page.getByRole("button", { name: "Verify my email" }).click();
  await expect(page.getByText("Your question is verified")).toBeVisible();
  expect(verifyCalls).toBe(1);
  expect(await page.evaluate(() => window.location.hash)).toBe("");
});

for (const width of [390, 1440]) {
  test(`landlord verified-inquiry inbox fits ${width}px and stays non-evaluative`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/app/rentals/${UNIT}/inquiries`);
    await expect(page.getByRole("heading", { name: "Sample basement apartment" })).toBeVisible();
    await expect(page.getByText("Jamie Renter")).toBeVisible();
    await expect(page.getByText(/does not score, rank, approve, or reject/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark closed" })).toBeDisabled();
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);
  });
}
