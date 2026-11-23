import { expect, test } from "@playwright/test";

test("the renter opens a private conversation explicitly and a different link clears the old view", async ({ page }) => {
  const firstToken = "a".repeat(64);
  const secondToken = "b".repeat(64);
  const firstReference = "INQ-111111111111";
  const secondReference = "TOUR-222222222222";
  const entry = "/inquiries/conversation";
  let opened: string | null = null;
  let opens = 0;
  let sent = false;
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route("**/api/v1/rental-conversations**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const input = request.postDataJSON();
      if (input.action === "open") {
        opens += 1;
        opened = input.token === firstToken ? firstReference : secondReference;
        return route.fulfill({ json: { reference: opened } });
      }
      expect(input).toMatchObject({ action: "reply", reference: secondReference, body: "Thank you for confirming." });
      sent = true;
    } else {
      expect(new URL(request.url()).searchParams.get("ref")).toBe(opened);
    }
    return route.fulfill({ json: {
      reference: opened,
      canReply: true,
      originalQuestion: opened === firstReference ? "Is water included?" : null,
      messages: sent ? [{
        id: "11111111-1111-4111-8111-111111111111", author: "renter", body: "Thank you for confirming.",
        createdAt: "2026-11-23T12:00:00Z",
      }] : [],
    } });
  });

  await page.goto(`${entry}#token=${firstToken}`);
  const open = page.getByRole("button", { name: "Open private conversation" });
  await expect(open).toBeVisible();
  expect(opens).toBe(0);
  await open.press("Enter");
  await expect(page.getByText("Is water included?")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`\\?ref=${firstReference}$`));
  await page.reload();
  await expect(page.getByText("Is water included?")).toBeVisible();

  await page.evaluate((token) => { window.location.hash = `token=${token}`; }, secondToken);
  await expect(open).toBeVisible();
  await expect(page.getByText("Is water included?")).toHaveCount(0);
  expect(opens).toBe(1);
  await open.click();
  await expect(page.getByText(secondReference)).toBeVisible();
  await page.getByRole("textbox", { name: "Reply in Crecy" }).fill("Thank you for confirming.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Thank you for confirming.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
