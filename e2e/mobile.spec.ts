import { expect, test, type Page } from "@playwright/test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The phone contract for the whole product.
 *
 * Every defect this file asserts against was real and shipped: the operator inbox laid out at 543px
 * inside a 390px phone (so Safari zoomed the entire page to ~72%); the payments register put the
 * amount just past the right edge, clipped mid-glyph, with the succeeded/failed badge off-screen
 * entirely; thirteen operator sections lived in a 1567px scroller that never scrolled the current
 * one into view; and Settings, Team access, Notifications, Privacy requests, Help and the
 * organization switcher existed only inside an `lg:flex` sidebar, so a phone could not reach them at
 * any number of taps.
 *
 * None of that was caught by the existing suite, because every spec ran at the default 1280px.
 *
 * ── Why the route list is derived rather than written down ───────────────────────────────────────
 *
 * A hand-maintained list rots silently: the route added next month is precisely the one nobody
 * thinks to add. Walking `src/app` means a new page is covered the day it lands, and a new dynamic
 * segment fails loudly here asking for a fixture id instead of being quietly skipped.
 */
const PHONE = { width: 390, height: 844 };   // iPhone 14/15/16 class — the modal width.
const NARROW = { width: 320, height: 720 };  // The floor: iPhone SE 1st gen, and small Androids.

/**
 * Fixture ids for dynamic segments, resolved against the demo/setup preview data the harness serves.
 * Keyed by full route first so that `[ownerEntityId]` can differ between the owner directory and the
 * owner-statements register, then by bare segment name.
 */
const ROUTE_FIXTURES: Record<string, string> = {
  "/app/owner-statements/[ownerEntityId]": "d1000000-0000-4000-8000-000000000001",
};
const SEGMENT_FIXTURES: Record<string, string> = {
  "[importJobId]": "preview-import",
  "[requestId]": "a0000000-0000-4000-8000-000000000001",
  "[conversationId]": "f0000000-0000-4000-8000-000000000001",
  "[ownerEntityId]": "b0000000-0000-4000-8000-000000000001",
  "[paymentId]": "50000000-0000-4000-8000-000000000005",
  "[propertyId]": "20000000-0000-4000-8000-000000000002",
  "[vendorId]": "b0000000-0000-4000-8000-000000000001",
  "[deliveryId]": "preview-delivery",
  "[documentSlug]": "operator-terms",
  "[approvalId]": "d0000000-0000-4000-8000-000000000001",
  "[statementId]": "preview-statement",
  "[organizationId]": "20000000-0000-4000-8000-000000000002",
  "[documentId]": "preview-document",
};

function collectPageFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectPageFiles(full, found);
    else if (entry === "page.tsx") found.push(full);
  }
  return found;
}

function routes(): string[] {
  const patterns = collectPageFiles("src/app")
    .map((file) => file.replace(/^src\/app/, "").replace(/\/page\.tsx$/, ""))
    // Route groups are organizational only and contribute no URL segment.
    .map((route) => route.replace(/\/\([^)]+\)/g, "").replace(/\/{2,}/g, "/"))
    .map((route) => route || "/")
    // `/dev/*` is the development-only email preview surface and fails closed in production.
    .filter((route) => !route.startsWith("/dev/"));

  return [...new Set(patterns)].sort().map((pattern) => {
    if (!pattern.includes("[")) return pattern;
    const override = ROUTE_FIXTURES[pattern];
    return pattern.replace(/\[[^\]]+\]/g, (segment) => {
      const value = override ?? SEGMENT_FIXTURES[segment];
      if (!value) throw new Error(`No fixture id for ${segment} in ${pattern}. Add one to SEGMENT_FIXTURES so this route is covered on a phone.`);
      return value;
    });
  });
}

const ALL_ROUTES = routes();

/**
 * The page is wider than the phone if the document's content box is.
 *
 * `documentElement.scrollWidth` is NOT the measure: it counts the unclipped extent of deliberate
 * horizontal scrollers, so a tab rail or a scrollable table makes an otherwise perfect page look
 * broken. An earlier pass of this audit reported nine failing routes on that number, four of which
 * were healthy. `body.scrollWidth` is the honest one.
 */
async function contentWidth(page: Page) {
  return page.evaluate(() => document.body.scrollWidth);
}

async function undersizedTextControls(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>("input, select, textarea")]
      .filter((el) => !["hidden", "checkbox", "radio"].includes((el as HTMLInputElement).type ?? ""))
      .filter((el) => el.getBoundingClientRect().width > 0)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${el.tagName.toLowerCase()}#${el.id || "(no id)"} @ ${getComputedStyle(el).fontSize}`));
}

test.describe("every page fits a phone", () => {
  test.use({ viewport: PHONE });

  for (const route of ALL_ROUTES) {
    test(`${route} fits 390px and zooms no input`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "networkidle" });
      // A route that errors has no layout to measure, so an overflow assertion on it would pass
      // vacuously. Both invitation-acceptance screens used to 500 here for exactly that reason.
      expect(response?.status(), `${route} did not render`).toBeLessThan(400);

      expect(await contentWidth(page), `${route} lays out wider than the phone, so the browser zooms the whole page out`)
        .toBeLessThanOrEqual(PHONE.width + 1);

      // Below 16px, iOS zooms the viewport in when the control takes focus and does not zoom back
      // out. The shared primitives carry `text-base sm:text-sm`; this catches a hand-rolled control
      // that skipped them.
      expect(await undersizedTextControls(page), `${route} has a control iOS will zoom into on focus`).toEqual([]);
    });
  }
});

test.describe("the narrowest phones still work", () => {
  test.use({ viewport: NARROW });

  // The shells, plus the surfaces whose overflow at 320px was found by measurement: the platform
  // console header and the resident signing ceremony.
  const FLOOR_ROUTES = ["/", "/login", "/app", "/app/payments", "/app/maintenance", "/home", "/owner", "/platform", "/platform/support", "/documents/preview-delivery/sign", "/settings/notifications", "/onboarding/organization"];

  for (const route of FLOOR_ROUTES) {
    test(`${route} fits 320px`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      expect(await contentWidth(page), `${route} overflows the narrowest supported phone`).toBeLessThanOrEqual(NARROW.width + 1);
    });
  }
});

test.describe("operator navigation on a phone", () => {
  test.use({ viewport: PHONE });

  const SECTIONS = [
    ["/app", "Overview"], ["/app/properties", "Properties"], ["/app/residents", "Residents"],
    ["/app/leases", "Leases"], ["/app/imports", "Imports"], ["/app/maintenance", "Maintenance"],
    ["/app/vendors", "Vendors"], ["/app/messages", "Messages"], ["/app/announcements", "Announcements"],
    ["/app/payments", "Payments"], ["/app/owners", "Owners"], ["/app/owner-statements", "Owner statements"],
    ["/app/documents", "Documents"],
  ] as const;

  for (const [route, label] of SECTIONS) {
    test(`${route} shows where you are`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      const bar = page.getByRole("navigation", { name: "Operator navigation" });

      // The old rail marked the current section with `aria-current` and then left it 1054px off
      // screen. "Marked" is not enough; it has to be ON the screen, which is what toBeInViewport
      // checks.
      const current = bar.locator('[aria-current="page"]');
      await expect(current, `${route}: nothing in the bar says which section this is`).toHaveCount(1);
      await expect(current).toBeInViewport();

      // Either the section is one of the four exposed tabs, or More is the current item AND wears
      // that section's name — never a bar that simply says "More" while you stand inside Payments.
      await expect(current).toHaveText(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    });
  }

  test("every section and every account destination is reachable in two taps", async ({ page }) => {
    await page.goto("/app", { waitUntil: "networkidle" });
    const bar = page.getByRole("navigation", { name: "Operator navigation" });

    // Tap one: More.
    await bar.getByRole("button", { name: /More|Residents|Leases|Imports|Vendors|Messages|Announcements|Owners|Owner statements|Documents/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    // Tap two: the destination. All thirteen sections are present across the bar and the sheet.
    for (const [href, label] of [
      ["/app/residents", "Residents"], ["/app/leases", "Leases"], ["/app/imports", "Imports"],
      ["/app/vendors", "Vendors"], ["/app/messages", "Messages"], ["/app/announcements", "Announcements"],
      ["/app/owners", "Owners"], ["/app/owner-statements", "Owner statements"], ["/app/documents", "Documents"],
    ] as const) {
      await expect(sheet.getByRole("link", { name: label, exact: true }), `${label} is not reachable from the phone menu`).toHaveAttribute("href", href);
    }

    // The six destinations that had NO phone route at all before this existed.
    for (const [href, label] of [
      ["/settings/payments", "Settings"], ["/settings/team", "Team access"],
      ["/settings/notifications?returnTo=/app", "Notifications"],
      ["/settings/privacy?returnTo=/app", "Privacy requests"], ["/security", "Help and security"],
    ] as const) {
      await expect(sheet.getByRole("link", { name: label, exact: true }), `${label} is unreachable on a phone`).toHaveAttribute("href", href);
    }

    // And the organization switcher, without which a multi-organization operator on a phone is
    // stuck in whichever context they last chose at a desk. Scoped to the sheet: the sidebar copy
    // is still in the document, display:none, and both would otherwise match.
    await expect(sheet.getByTestId("organization-switcher-sheet")).toBeVisible();
  });

  test("the menu closes when you arrive somewhere", async ({ page }) => {
    // Next keeps this component mounted across a client navigation, so without an explicit close the
    // sheet stays over the page the reader just asked for.
    await page.goto("/app", { waitUntil: "networkidle" });
    await page.getByRole("navigation", { name: "Operator navigation" }).getByRole("button").click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("link", { name: "Residents", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/residents$/);
    await expect(sheet).toBeHidden();
  });

  test("the bottom bar never covers the end of the page", async ({ page }) => {
    await page.goto("/app/residents", { waitUntil: "networkidle" });
    const overlap = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const bar = document.querySelector<HTMLElement>('nav[aria-label="Operator navigation"]');
      const main = document.querySelector("main");
      if (!bar || !main) return null;
      return Math.round(main.getBoundingClientRect().bottom - bar.getBoundingClientRect().top);
    });
    expect(overlap, "the fixed bar sits on top of the last content on the page").toBeLessThanOrEqual(0);
  });
});

test.describe("owner navigation on a phone", () => {
  test.use({ viewport: PHONE });

  for (const route of ["/owner", "/owner/documents", "/owner/messages", "/owner/preferences"]) {
    test(`${route} scrolls its rail to the current section`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      const current = page.getByRole("navigation", { name: "Owner navigation" }).locator('[aria-current="page"]');
      await expect(current).toHaveCount(1);
      // Seven tabs need 694px. Without the rail scrolling itself, Approvals, Documents, Messages and
      // Preferences all sat past the right edge with nothing to say they were there.
      await expect(current).toBeInViewport();
    });
  }
});

test.describe("financial registers on a phone", () => {
  test.use({ viewport: PHONE });

  const REGISTERS = [
    { route: "/app/payments", label: "Recent payments, scrollable", mustShow: [/\$[\d,]+\.\d\d/, /succeeded|failed|returned|pending/i] },
    { route: "/app/maintenance", label: "Maintenance requests, scrollable", mustShow: [/Needs triage|assigned|scheduled|completed/i] },
    { route: "/owner", label: "Recent statements, scrollable", mustShow: [/\$[\d,]+\.\d\d/] },
  ] as const;

  for (const { route, label, mustShow } of REGISTERS) {
    test(`${route} keeps its decisive column on screen`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      const region = page.getByRole("region", { name: label });
      await expect(region).toBeVisible();

      const result = await page.evaluate((name) => {
        const scroller = [...document.querySelectorAll<HTMLElement>('[role="region"]')].find((el) => el.getAttribute("aria-label") === name);
        const table = scroller?.querySelector("table");
        if (!scroller || !table) return null;
        const displayed = (el: Element) => getComputedStyle(el).display !== "none";
        const box = scroller.getBoundingClientRect();
        const heads = [...table.querySelectorAll("thead th")];
        const firstRow = table.querySelector("tbody tr");
        const cells = firstRow ? [...firstRow.children] : [];
        return {
          headCount: heads.length,
          cellCount: cells.length,
          shownHeads: heads.filter(displayed).length,
          shownCells: cells.filter(displayed).length,
          clipped: heads.filter(displayed).filter((h) => h.getBoundingClientRect().right > box.right + 1).map((h) => h.textContent?.trim()),
          // Only text that is actually painted — `textContent` would happily return the collapsed
          // columns and make this assertion meaningless.
          visibleText: (firstRow as HTMLElement | null)?.innerText ?? "",
        };
      }, label);

      expect(result, `${route}: no register table found`).not.toBeNull();
      // Hiding a `th` without its `td` desynchronises the column headers from the data, which breaks
      // the row/column association a screen reader relies on — a worse defect than the overflow.
      expect(result!.headCount, `${route}: header and cell counts diverge`).toBe(result!.cellCount);
      expect(result!.shownHeads, `${route}: a column is collapsed in the header but not the body, or vice versa`).toBe(result!.shownCells);
      expect(result!.clipped, `${route}: a rendered column is off the right edge`).toEqual([]);

      for (const pattern of mustShow) {
        expect(result!.visibleText, `${route}: the row does not show ${pattern} without scrolling sideways`).toMatch(pattern);
      }
    });
  }

  test("a scrollable register is reachable by keyboard", async ({ page }) => {
    // A bare `overflow-x-auto` div is not focusable in every browser, so a keyboard-only operator
    // cannot scroll it and a screen reader announces nothing when it lands there. These four
    // registers had none of `role`, `tabindex` or a name; the marketing tables already did.
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto("/app/payments", { waitUntil: "networkidle" });
    const region = page.getByRole("region", { name: "Recent payments, scrollable" });
    await expect(region).toHaveAttribute("tabindex", "0");
  });
});

test.describe("invitation acceptance without a backend", () => {
  test.use({ viewport: PHONE });

  for (const route of ["/invitations/accept", "/settings/team/accept"]) {
    test(`${route} renders instead of crashing, and offers no acceptance`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.status(), `${route} still fails to render`).toBe(200);

      // It must NOT fall back to sample data like the rest of the product: a mocked acceptance
      // control is an activation affordance with no invitation behind it.
      await expect(page.getByRole("button", { name: /accept|activate|join/i })).toHaveCount(0);
    });
  }
});
