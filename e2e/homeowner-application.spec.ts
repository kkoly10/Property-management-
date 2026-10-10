import { expect, test } from "@playwright/test";

const UNIT = "80000000-0000-4000-8000-000000000008";
const PUBLIC_ID = "81000000-0000-4000-8000-000000000081";
const TOKEN = "b".repeat(64);

for (const width of [390, 1440]) {
  test(`public application form fits ${width}px and requires no screening`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/l/${PUBLIC_ID}`);
    const card = page.getByRole("heading", { name: "Apply for this rental" }).locator("..");
    await expect(card.getByLabel("Email address")).toBeVisible();
    const moveIn = card.getByLabel("Desired move-in date");
    await expect(moveIn).toBeVisible();
    const bounds = await moveIn.evaluate((element) => {
      const input = element as HTMLInputElement;
      const min = input.min;
      const max = input.max;
      input.value = "2099-12-31";
      return { min, max, overflowRejected: input.validity.rangeOverflow };
    });
    expect(bounds.min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(bounds.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(bounds.max >= bounds.min).toBe(true);
    expect(bounds.overflowRejected).toBe(true);
    await expect(card.getByRole("button", { name: "Submit my application" })).toBeVisible();
    await expect(card).toContainText("No application fee or screening");
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}
test("opening applicant verification does not consume the token", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/v1/rental-applications/verify", async (route) => {
    calls += 1;
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ verified: true, accessGranted: true,
        applicationReference: "APP-1234ABCD5678", message: "Verified" }) });
  });
  await page.goto(`/applications/verify#token=${TOKEN}`);
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify my email" })).toBeVisible();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Verify my email" }).click();
  await expect(page.getByText("Application verified")).toBeVisible();
  expect(calls).toBe(1);
  expect(await page.evaluate(() => window.location.hash)).toBe("");
  await expect(page.getByRole("link", { name: "View my application" }))
    .toHaveAttribute("href", "/applications?ref=APP-1234ABCD5678");
});
test("malformed successful verification cannot consume the applicant's retry UI", async ({ page }) => {
  const tokens: string[] = [];
  await page.route("**/api/v1/rental-applications/verify", async (route) => {
    const body = route.request().postDataJSON() as { token: string };
    tokens.push(body.token);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(
      tokens.length === 1
        ? { verified: true, accessGranted: true, applicationReference: "WRONG-REF" }
        : { verified: true, accessGranted: true, applicationReference: "APP-1234ABCD5678", message: "Verified" },
    ) });
  });
  await page.goto(`/applications/verify#token=${TOKEN}`);
  await page.getByRole("button", { name: "Verify my email" }).click();
  await expect(page.getByText("Verification not completed")).toBeVisible();
  await expect(page.getByRole("link", { name: "View my application" })).toHaveCount(0);
  await page.getByRole("button", { name: "Verify my email" }).click();
  await expect(page.getByText("Application verified")).toBeVisible();
  expect(tokens).toEqual([TOKEN, TOKEN]);
});
for (const width of [390, 1440]) {
  test(`landlord application inbox fits ${width}px without applicant scoring`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/app/rentals/${UNIT}/applications`);
    await expect(page.getByRole("heading", { name: "Rental", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No verified applications yet" })).toBeVisible();
    await expect(page.getByText(/does not screen, rank, recommend/i)).toBeVisible();
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}

// A missing capability must render an explicit private-state message, without waiting
// for every optional background request to go idle.
test("applicant status without access fails closed and fits 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/applications", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "Application status" })).toBeVisible();
  await expect(page.getByText("Application access is unavailable")).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(391);
});

test("duplicate application references cannot cause a client-side status request", async ({ page }) => {
  let statusCalls = 0;
  await page.route("**/api/v1/rental-applications/status**", async (route) => {
    statusCalls += 1;
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  await page.goto("/applications?ref=APP-1234ABCD5678&ref=APP-8765DCBA4321", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText("Application access is unavailable")).toBeVisible();
  expect(statusCalls).toBe(0);
});

test("applicant status never renders another application's response", async ({ page }) => {
  await page.route("**/api/v1/rental-applications/status**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      applicationReference: "APP-8765DCBA4321", firstName: "Other", lastName: "Applicant",
      email: "other@example.com", desiredMoveInOn: "2026-12-01",
      leaseTermText: "", applicantNote: "", status: "submitted",
      listingTitle: "Other person's home", rentAmountMinor: 120000, currencyCode: "USD",
      listingAvailableOn: "2026-11-01", version: 2,
    }) });
  });
  await page.goto("/applications?ref=APP-1234ABCD5678", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Application access is unavailable")).toBeVisible();
  await expect(page.getByText("other@example.com")).toHaveCount(0);
});
