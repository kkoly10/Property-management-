import { expect, test, type Page } from "@playwright/test";

/**
 * The transactional email family, rendered in a real browser.
 *
 * Mail clients are not browsers, so this does not prove a message survives Outlook. What it does prove
 * is the set of things a client can only make worse: that the markup renders, that the message fits a
 * phone-width column, that the call to action is a real link with a real destination, that nothing
 * depends on a remote image or a script, and that the copyable URL wraps instead of forcing a
 * horizontal scrollbar.
 *
 * 320px is the narrow case on purpose — the width the Part 3 requirement names, and narrower than the
 * 390px used for product pages, because an email preview pane is not a phone viewport.
 */
const FIXTURES = [
  "staff-invitation",
  "resident-invitation",
  "owner-invitation",
  "document-delivered",
  "announcement",
  "conversation-message",
  "auth-magiclink",
  "auth-recovery",
  "auth-password-changed",
] as const;

const WIDTHS = [320, 600] as const;

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow, `${label} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test.describe("transactional email rendering", () => {
  for (const fixture of FIXTURES) {
    test(`${fixture} renders as a self-contained email`, async ({ page }) => {
      const response = await page.goto(`/dev/email-preview/${fixture}`);
      expect(response?.status(), `${fixture} preview status`).toBe(200);

      // A visible heading, not only a <title> — a <title> is never shown inside a mail client.
      await expect(page.locator("h1").first(), `${fixture}: heading`).toBeVisible();

      // Nothing remote. An email that needs to fetch something renders as a broken box with images off.
      expect(await page.locator("img").count(), `${fixture}: remote image`).toBe(0);
      expect(await page.locator("script").count(), `${fixture}: script`).toBe(0);
      expect(await page.locator('link[rel="stylesheet"]').count(), `${fixture}: external stylesheet`).toBe(0);
    });
  }

  for (const width of WIDTHS) {
    test(`every email fits a ${width}px column`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const fixture of FIXTURES) {
        await page.goto(`/dev/email-preview/${fixture}`);
        await assertNoHorizontalOverflow(page, `${fixture} at ${width}px`);
      }
    });
  }

  test("an invitation's call to action is a real link with a touch-sized target", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/dev/email-preview/staff-invitation");

    const cta = page.getByRole("link", { name: "Accept the invitation" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /^https:\/\//);

    const box = await cta.boundingBox();
    // 44px is the minimum comfortable touch target; a button below it is a mis-tap on a phone.
    expect(box?.height ?? 0, "call-to-action height").toBeGreaterThanOrEqual(44);
  });

  test("a security notification offers nothing to click", async ({ page }) => {
    // The decisive anti-phishing property: "your password was changed" must never train a recipient to
    // click a button, because the forged copy is the one that will have a button too.
    await page.goto("/dev/email-preview/auth-password-changed");
    await expect(page.locator("h1").first()).toBeVisible();
    expect(await page.locator("a").count(), "a security notification rendered a link").toBe(0);
  });

  test("the copyable link is present and wraps rather than widening the card", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/dev/email-preview/resident-invitation");
    await expect(page.getByText("copy and paste this link into your browser")).toBeVisible();
    await assertNoHorizontalOverflow(page, "resident invitation with a long URL");
  });

  test("each surface carries its own identity", async ({ page }) => {
    for (const [fixture, brand] of [
      ["staff-invitation", "Crecy"],
      ["resident-invitation", "Crecy Living"],
      ["owner-invitation", "Crecy Owner"],
    ] as const) {
      await page.goto(`/dev/email-preview/${fixture}`);
      await expect(page.getByText(brand, { exact: true }).first(), `${fixture}: wordmark`).toBeVisible();
    }
  });
});
