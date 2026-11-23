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

  await expect(page.getByRole("heading", { name: "Garden-level apartment" })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Question" })).toBeVisible();
  await page.getByRole("tab", { name: "Tour" }).click();
  await expect(page.getByRole("tabpanel", { name: "Tour" })).toBeVisible();
  await page.getByRole("tab", { name: "Apply" }).click();
  await expect(page.getByRole("tabpanel", { name: "Apply" })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("123 Example Street");
});

test("a renter can review published requirements before starting an application on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/rental-applications", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      publicId: DISCOVERABLE,
      requirementsVersion: "83000000-0000-4e00-8000-000000000084",
    });
    await route.fulfill({ status: 202, json: { accepted: true } });
  });
  await page.goto(`/l/${DISCOVERABLE}`);
  const disclosure = page.getByRole("region", { name: "Before you apply" });
  await expect(disclosure).toContainText("Landlord’s criteria");
  await expect(disclosure).toContainText("Applicant-provided credit information");
  await expect(disclosure).toContainText("Government-issued ID");
  await expect(disclosure).toContainText("Paystubs or other proof of income");
  await expect(disclosure).toContainText("offer letter");
  await page.getByRole("tab", { name: "Apply" }).click();
  await page.getByRole("link", { name: "Review the landlord’s application requirements" }).click();
  await expect(page).toHaveURL(/#listing-application-requirements$/);
  await expect(disclosure).toBeInViewport();
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const application = page.getByRole("tabpanel", { name: "Apply" });
  await application.getByRole("textbox", { name: "First name" }).fill("Synthetic");
  await application.getByRole("textbox", { name: "Last name" }).fill("Applicant");
  await application.getByRole("textbox", { name: "Email address" }).fill("criteria-test@example.test");
  await application.getByRole("button", { name: "Submit my application" }).click();
  await expect(application.getByText("Check your email")).toBeVisible();

  await page.goto(`/l/${UNLISTED}`);
  await expect(page.getByRole("region", { name: "Before you apply" })).toHaveCount(0);
});
