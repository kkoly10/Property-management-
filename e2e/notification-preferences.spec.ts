import { test, expect } from "@playwright/test";

// The preference matrix is 5 categories x 4 channels on three surfaces. It used to be a single
// horizontal-scroll table with a 640px min-width, which inside a card at a 390px viewport left a
// 300px scroll port against 640px of content: 0 of 20 checkboxes and 4 of 5 column headers were
// off-screen with no affordance saying it scrolled, so the page's primary control read as missing.
// Doc 15 §7 requires critical actions to remain reachable on mobile and §9 tests at 390px.
const SURFACES = ["/more/preferences", "/settings/notifications", "/owner/preferences"];

for (const path of SURFACES) {
  // 768 is the md handover where the table replaces the cards: the width a clip would reappear at.
  for (const width of [390, 640, 768, 1440]) {
    test(`every channel toggle is on-screen at ${width}px on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const seen = await page.evaluate(() => {
        const de = document.documentElement;
        // display:none excludes the layout that is not active, so exactly one of the two renders.
        const live = [...document.querySelectorAll<HTMLElement>('input[type="checkbox"]')]
          .filter((b) => b.offsetParent !== null && b.closest("table, fieldset"));
        const onScreen = live.filter((b) => {
          const r = b.getBoundingClientRect();
          const scroller = b.closest<HTMLElement>(".overflow-x-auto");
          if (scroller) {
            const s = scroller.getBoundingClientRect();
            if (r.left < s.left - 1 || r.right > s.right + 1) return false;
          }
          return r.left >= 0 && r.right <= de.clientWidth + 1;
        });
        return { rendered: live.length, onScreen: onScreen.length, bodyScrollsX: de.scrollWidth > de.clientWidth + 1 };
      });
      // 5 categories x 4 channels, rendered exactly once so the tab order has no duplicates.
      expect(seen.rendered, "matrix toggles rendered").toBe(20);
      expect(seen.onScreen, "matrix toggles reachable without clipping").toBe(20);
      expect(seen.bodyScrollsX, "page must not scroll horizontally").toBe(false);
    });
  }
}

// Both widths, because the two layouts carry their names differently: the table uses aria-label, the
// mobile cards use a legend for the category plus a wrapping label for the channel.
for (const width of [390, 1440]) {
  test(`offers no toggle for access mail on any surface at ${width}px`, async ({ page }) => {
  // private.notification_template_category returns NULL for invitations so they can never be
  // suppressed; the UI must therefore expose exactly the five non-NULL categories and nothing else.
  await page.setViewportSize({ width, height: 900 });
  for (const path of SURFACES) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
        .filter((b) => b.offsetParent !== null && b.closest("table, fieldset"))
        .map((b) => b.getAttribute("aria-label") ?? b.closest("fieldset")?.querySelector("legend")?.textContent ?? ""));
    expect(labels.length, path).toBe(20);
    expect(labels.join(" "), path).not.toMatch(/invitation|security|sign[- ]?in|password/i);
    expect(labels.filter(Boolean).length, `${path} has an unnamed toggle`).toBe(20);
  }
  });
}

test("both layouts are bound to one state, so the hidden one cannot drift", async ({ page }) => {
  // The mobile cards and the table are separate DOM, and separate DOM is how two copies of a control
  // quietly end up with two copies of the state. Toggling the visible one must move the hidden one.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/settings/notifications", { waitUntil: "domcontentloaded" });
  // Demo mode disables every control; strip the attribute to exercise the wiring a real user gets.
  // The submit handler still refuses on its own `disabled` prop, so this cannot post anything.
  await page.evaluate(() => document.querySelectorAll("[disabled]").forEach((el) => el.removeAttribute("disabled")));
  const sms = page.locator("fieldset").first().getByRole("checkbox").nth(1);
  await sms.check();
  await expect(sms).toBeChecked();
  const mirrored = await page.evaluate(() =>
    (document.querySelector('table input[aria-label="Payments and receipts by SMS"]') as HTMLInputElement)?.checked);
  expect(mirrored, "the table did not follow the mobile toggle").toBe(true);
});
