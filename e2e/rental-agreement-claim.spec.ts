import { expect, test } from "@playwright/test";

test("a first-time renter explicitly requests secure sign-in on a narrow phone", async ({ page }) => {
  const token = "b".repeat(64);
  let requests = 0;
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route("**/api/v1/rental-agreements/claim?surface=participant", (route) => {
    requests += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ token });
    return route.fulfill({ status: 202, json: { emailRequested: true } });
  });
  await page.goto(`/documents/agreements/claim#token=${token}`);
  const button = page.getByRole("button", { name: "Continue to agreement" });
  await expect(button).toBeVisible();
  await expect(page).toHaveURL(/\/documents\/agreements\/claim$/);
  expect(requests).toBe(0);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Check the email address you used to apply/)).toBeVisible();
  expect(requests).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("opening the second signing email does not redeem its credential", async ({ page }) => {
  const agreementId = "85000000-0000-4000-8000-000000000085";
  const signIn = "protected.email-credential";
  let requests = 0;
  await page.route("**/api/v1/rental-agreements/claim?surface=participant", (route) => {
    requests += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ agreementId, signIn });
    return route.fulfill({ json: { agreementId, claimed: true, replayed: false } });
  });
  const agreement = `/documents/agreements/${agreementId}`;
  await page.goto(`${agreement}/claim#sign_in=${signIn}`);
  const button = page.getByRole("button", { name: "Continue to agreement" });
  await expect(button).toBeVisible();
  await expect(page).toHaveURL(`${agreement}/claim`);
  expect(requests).toBe(0);
  await button.click();
  await expect(page).toHaveURL(agreement);
  expect(requests).toBe(1);
});
