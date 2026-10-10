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

async function undersizedSharedTouchControls(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-slot="button"], [data-slot="input"], [data-slot="native-select"]')]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
      })
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map((el) => {
        const box = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}#${el.id || "(no id)"} @ ${Math.round(box.height)}px`;
      }));
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
      expect(await undersizedSharedTouchControls(page), `${route} has a shared control below the 44px phone touch target`).toEqual([]);
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
    test(`${route} keeps the current owner destination visible`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      const current = page.getByRole("navigation", { name: "Owner navigation" }).locator('[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toBeInViewport();
    });
  }

  test("every owner destination is reachable in two taps", async ({ page }) => {
    await page.goto("/owner", { waitUntil: "networkidle" });
    const nav = page.getByRole("navigation", { name: "Owner navigation" });

    for (const label of ["Overview", "Statements", "Approvals", "Messages"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }

    await nav.getByRole("button", { name: "More", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Distributions", exact: true })).toHaveAttribute("href", "/owner#remittances");
    await expect(sheet.getByRole("link", { name: "Documents", exact: true })).toHaveAttribute("href", "/owner/documents");
    await expect(sheet.getByRole("link", { name: "Preferences", exact: true })).toHaveAttribute("href", "/owner/preferences");
  });

  test("the owner bottom bar does not cover the end of the page", async ({ page }) => {
    await page.goto("/owner", { waitUntil: "networkidle" });
    const overlap = await page.evaluate(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
      const bar = [...document.querySelectorAll<HTMLElement>('nav[aria-label="Owner navigation"]')]
        .find((candidate) => candidate.getBoundingClientRect().height > 0);
      const main = document.querySelector("main");
      if (!bar || !main) return null;
      return Math.round(main.getBoundingClientRect().bottom - bar.getBoundingClientRect().top);
    });
    expect(overlap).toBeLessThanOrEqual(0);
  });
});

test.describe("mobile records replace compressed desktop registers", () => {
  test.use({ viewport: PHONE });

  const REGISTERS = [
    { route: "/app/payments", label: "Recent payments", mustShow: [/Amount/i, /\$[\d,]+\.\d\d/, /succeeded|failed|returned|pending/i] },
    { route: "/app/maintenance", label: "Maintenance requests", mustShow: [/Official priority/i, /Needs triage|assigned|scheduled|completed/i] },
    { route: "/owner", label: "Recent statements", mustShow: [/Owner payable/i, /\$[\d,]+\.\d\d/] },
  ] as const;

  for (const { route, label, mustShow } of REGISTERS) {
    test(`${route} uses a scan-friendly record card on a phone`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      const region = page.getByRole("region", { name: label });
      await expect(region).toBeVisible();

      const firstRecord = region.locator("[data-mobile-record]").first();
      await expect(firstRecord, `${route}: no mobile record rendered`).toBeVisible();
      const visibleText = await firstRecord.innerText();
      for (const pattern of mustShow) {
        expect(visibleText, `${route}: mobile record does not show ${pattern}`).toMatch(pattern);
      }

      await expect(region.locator("table"), `${route}: desktop table is still painted on the phone`).toBeHidden();
      const box = await firstRecord.boundingBox();
      expect(box?.width ?? 0, `${route}: mobile record is too narrow to be the primary presentation`).toBeGreaterThan(300);
    });
  }

  test("the desktop payment register remains keyboard reachable", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto("/app/payments", { waitUntil: "networkidle" });
    const region = page.getByRole("region", { name: "Recent payments" });
    await expect(region).toHaveAttribute("tabindex", "0");
  });

  test("property detail exposes all section jumps and unit cards without sideways discovery", async ({ page }) => {
    await page.goto("/app/properties/20000000-0000-4000-8000-000000000002", { waitUntil: "networkidle" });
    const nav = page.getByRole("navigation", { name: "Property sections" });
    await nav.scrollIntoViewIfNeeded();
    const horizontalGeometry = await nav.evaluate((element) => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      links: [...element.querySelectorAll("a")].map((link) => {
        const box = link.getBoundingClientRect();
        return { left: box.left, right: box.right };
      }),
    }));
    expect(horizontalGeometry.scrollWidth, "property section choices should not require sideways scrolling").toBe(horizontalGeometry.clientWidth);
    for (const link of horizontalGeometry.links) {
      expect(link.left).toBeGreaterThanOrEqual(horizontalGeometry.left - 1);
      expect(link.right).toBeLessThanOrEqual(horizontalGeometry.right + 1);
    }

    const units = page.getByRole("region", { name: "Units" });
    await expect(units.locator("[data-mobile-record]").first()).toBeVisible();
    await expect(units.locator("table")).toBeHidden();
  });
});

test.describe("phone touch ergonomics", () => {
  test.use({ viewport: PHONE });

  for (const route of ["/app", "/payments/new"]) {
    test(`${route} keeps shared form controls thumb-sized`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      const undersized = await page.locator(
        '[data-slot="button"]:visible, [data-slot="input"]:visible, [data-slot="native-select"]:visible',
      ).evaluateAll((elements) => elements
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            text: (element.textContent ?? "").trim().slice(0, 40),
            height: Math.round(box.height),
          };
        })
        .filter((control) => control.height < 44));
      expect(undersized, `${route}: shared controls smaller than the 44px phone target`).toEqual([]);
    });
  }

  test("owner and resident header actions are thumb-sized", async ({ page }) => {
    for (const [route, label] of [
      ["/owner", "Owner messages"],
      ["/home", "Notification preferences"],
    ] as const) {
      await page.goto(route, { waitUntil: "networkidle" });
      const control = page.getByLabel(label);
      const box = await control.boundingBox();
      expect(box?.height ?? 0, `${route}: ${label} is too short for a phone target`).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0, `${route}: ${label} is too narrow for a phone target`).toBeGreaterThanOrEqual(44);
    }
  });

  test("resident payment allocation labels the amount field on a phone", async ({ page }) => {
    await page.goto("/payments/new", { waitUntil: "networkidle" });
    const mobileLabel = page.locator('label[for^="resident-allocation-"]').first();
    await expect(mobileLabel).toBeVisible();
    await expect(mobileLabel).toContainText(/Apply to/i);
    await expect(page.getByText("Open charge", { exact: true })).toBeHidden();
  });
});

test.describe("secondary operator workflows stay phone-first", () => {
  test.use({ viewport: PHONE });

  test("payment actions appear before long payment history on a phone", async ({ page }) => {
    await page.goto("/app/payments/50000000-0000-4000-8000-000000000005", { waitUntil: "networkidle" });
    const actions = page.getByRole("complementary", { name: "Payment actions" });
    const history = page.getByRole("heading", { name: "Settlement history" });
    await expect(actions).toBeVisible();
    await expect(history).toBeVisible();
    const [actionsBox, historyBox] = await Promise.all([actions.boundingBox(), history.boundingBox()]);
    expect(actionsBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(historyBox?.y ?? Number.NEGATIVE_INFINITY);
  });

  test("maintenance actions appear before the detail record on a phone", async ({ page }) => {
    await page.goto("/app/maintenance/a0000000-0000-4000-8000-000000000001", { waitUntil: "networkidle" });
    const actions = page.getByRole("complementary", { name: "Maintenance actions" });
    const report = page.getByRole("heading", { name: "Resident report" });
    await expect(actions).toBeVisible();
    await expect(report).toBeVisible();
    const [actionsBox, reportBox] = await Promise.all([actions.boundingBox(), report.boundingBox()]);
    expect(actionsBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(reportBox?.y ?? Number.NEGATIVE_INFINITY);
  });

  test("import mapping prioritizes required fields and collapses optional fields", async ({ page }) => {
    await page.goto("/app/imports/preview-import", { waitUntil: "networkidle" });
    await expect(page.getByText("Required mappings", { exact: true })).toBeVisible();

    const optional = page.getByTestId("optional-import-mappings");
    await expect(optional).toBeVisible();
    await expect(optional).not.toHaveAttribute("open", "");
    const optionalSelects = optional.locator("select");
    expect(await optionalSelects.count()).toBeGreaterThan(0);
    await expect(optionalSelects.first()).toBeHidden();

    await optional.locator("summary").click();
    await expect(optionalSelects.first()).toBeVisible();
  });

  test("team access controls and destructive actions are thumb-sized and stacked", async ({ page }) => {
    await page.goto("/settings/team", { waitUntil: "networkidle" });

    const inviteMfa = page.getByText("Require MFA for this user", { exact: true }).locator("..");
    const inviteProperty = page.getByRole("group", { name: "Property access" }).locator("label").first();
    for (const control of [inviteMfa, inviteProperty]) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    const inviteButton = page.getByRole("button", { name: "Invite staff member" });
    const inviteBox = await inviteButton.boundingBox();
    expect(inviteBox?.width ?? 0).toBeGreaterThanOrEqual(300);

    const roster = page.getByRole("region", { name: "Team roster" }).or(page.locator('section[aria-labelledby="team-roster"]'));
    const saveButton = roster.getByRole("button", { name: "Save role/status" }).first();
    const revokeButton = roster.getByRole("button", { name: "Revoke access" }).first();
    for (const control of [saveButton, revokeButton]) {
      const box = await control.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(300);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("minimum mobile quality on low-frequency surfaces", () => {
  test.use({ viewport: PHONE });

  test("onboarding progress names every step instead of showing unlabeled dots", async ({ page }) => {
    await page.goto("/onboarding/organization", { waitUntil: "networkidle" });
    for (const label of ["Workspace", "Entity & book", "First property"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("document upload is reachable before the register on a phone", async ({ page }) => {
    await page.goto("/app/documents", { waitUntil: "networkidle" });
    const upload = page.getByText("Upload document", { exact: true }).first();
    const register = page.getByText("Document register", { exact: true }).first();
    await expect(upload).toBeVisible();
    await expect(register).toBeVisible();
    const [uploadBox, registerBox] = await Promise.all([upload.boundingBox(), register.boundingBox()]);
    expect(uploadBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(registerBox?.y ?? Number.NEGATIVE_INFINITY);
  });

  test("notification and payment settings keep their primary actions full-width on phones", async ({ page }) => {
    await page.goto("/settings/notifications", { waitUntil: "networkidle" });
    for (const control of [
      page.getByRole("button", { name: "Save preferences" }),
      page.getByRole("link", { name: "Privacy requests" }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(300);
    }

    await page.goto("/settings/payments", { waitUntil: "networkidle" });
    const paymentAction = page.getByRole("button", { name: /Connect Stripe|Continue verification|Opening Stripe/i })
      .or(page.getByRole("link", { name: /Verify with MFA|Review in Stripe/i }))
      .first();
    await expect(paymentAction).toBeVisible();
    const paymentBox = await paymentAction.boundingBox();
    expect(paymentBox?.width ?? 0).toBeGreaterThanOrEqual(300);
  });

  test("owner approvals expose the decision area after the facts", async ({ page }) => {
    await page.goto("/owner/approvals/d0000000-0000-4000-8000-000000000001", { waitUntil: "networkidle" });
    const jump = page.getByRole("link", { name: /Review and decide|View decision record/i });
    await expect(jump).toBeVisible();
    await expect(jump).toHaveAttribute("href", "#owner-decision");
    const box = await jump.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(300);
    await expect(page.locator("#owner-decision")).toBeAttached();
  });

  test("owner document actions stack into full-width phone controls", async ({ page }) => {
    await page.goto("/owner/documents", { waitUntil: "networkidle" });
    const register = page.getByRole("region", { name: "Owner document register" });
    await expect(register).toBeVisible();
    const action = register.getByRole("link", { name: /Download|Certificate|Review & sign/i }).first();
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(300);
  });

  test("privacy and platform support primary actions are thumb-oriented", async ({ page }) => {
    await page.goto("/settings/privacy", { waitUntil: "networkidle" });
    const submit = page.getByRole("button", { name: "Submit request" });
    const submitBox = await submit.boundingBox();
    expect(submitBox?.width ?? 0).toBeGreaterThanOrEqual(300);

    await page.goto("/platform/support", { waitUntil: "networkidle" });
    const search = page.getByRole("button", { name: "Search" });
    const searchBox = await search.boundingBox();
    expect(searchBox?.width ?? 0).toBeGreaterThanOrEqual(300);
  });

  test("secure signing gives the primary step action the phone width", async ({ page }) => {
    await page.goto("/documents/preview-delivery/sign", { waitUntil: "networkidle" });
    const continueButton = page.getByRole("button", { name: "Continue" }).first();
    await expect(continueButton).toBeVisible();
    const box = await continueButton.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(280);
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
