import { test, expect, type Page } from "@playwright/test";

// The public launch surface, exercised in the browser at both a phone width and a desktop width.
//
// Two classes of defect are only findable here: a layout that overflows horizontally (which no unit
// test can see, and which makes a marketing page feel broken on the device most visitors use), and a
// navigation link that 404s. Both are checked on every public route rather than on a sample.

const ROUTES = ["/", "/product", "/pricing", "/crecy-living", "/security", "/pilot", "/legal"] as const;

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1440, height: 900 };

async function assertRenders(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${path} responded ${response?.status()}`).toBeLessThan(400);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("Application error");
}

/**
 * The horizontal-overflow check.
 *
 * `scrollWidth > clientWidth` on the document element is the browser's own statement that the page is
 * wider than the viewport. A tolerance of 1px absorbs sub-pixel rounding on fractional device widths;
 * anything more is a real overflow, and the assertion names the widest offending element so the failure
 * is actionable rather than "something is too wide".
 */
async function assertNoHorizontalOverflow(page: Page, path: string) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    if (overflow <= 1) return { overflow, culprit: null as string | null };
    let culprit: string | null = null;
    let widest = 0;
    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const rect = element.getBoundingClientRect();
      const right = rect.right;
      if (right > doc.clientWidth + 1 && rect.width > widest) {
        widest = rect.width;
        culprit = `${element.tagName.toLowerCase()}.${element.className?.toString().slice(0, 80)}`;
      }
    }
    return { overflow, culprit };
  });
  expect(
    result.overflow,
    `${path} overflows horizontally by ${result.overflow}px (widest offender: ${result.culprit ?? "unknown"})`,
  ).toBeLessThanOrEqual(1);
}

test.describe("public marketing surface", () => {
  test("every public route renders on desktop with no horizontal overflow", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    for (const path of ROUTES) {
      await assertRenders(page, path);
      await assertNoHorizontalOverflow(page, path);
    }
  });

  test("every public route renders on a phone with no horizontal overflow", async ({ page }) => {
    await page.setViewportSize(PHONE);
    for (const path of ROUTES) {
      await assertRenders(page, path);
      await assertNoHorizontalOverflow(page, path);
    }
  });

  test("the root is the marketing page, not a redirect to signup", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const response = await page.goto("/");
    expect(new URL(page.url()).pathname).toBe("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Rental operations, finally connected.");
    await expect(page.getByRole("link", { name: "Start free" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "See the platform" }).first()).toBeVisible();
  });

  test("desktop navigation reaches every marketing page", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    for (const [label, path] of [
      ["Product", "/product"],
      ["Pricing", "/pricing"],
      ["Crecy Living", "/crecy-living"],
      ["Security", "/security"],
      ["Pilot", "/pilot"],
    ] as const) {
      await page.goto("/");
      await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: label, exact: true }).click();
      await page.waitForURL(`**${path}`);
      await expect(page.locator("h1")).toHaveCount(1);
    }
  });

  test("the mobile menu opens and its links navigate", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    const mobileNav = page.getByRole("navigation", { name: "Primary mobile" });
    // The menu is a CSS disclosure, so its links exist in the DOM but must not be reachable until it is
    // opened — otherwise a phone visitor gets an invisible tab stop through five links.
    await expect(mobileNav.getByRole("link", { name: "Pricing" })).toBeHidden();
    // The toggle is a <label> wrapping an icon; clicking the label is what a visitor does, and the
    // inner <svg> would otherwise intercept a text-targeted click.
    await page.locator('label[for="marketing-menu"]').click();
    await expect(mobileNav.getByRole("link", { name: "Pricing" })).toBeVisible();
    await mobileNav.getByRole("link", { name: "Pricing" }).click();
    await page.waitForURL("**/pricing");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Priced by the units");
  });

  test("the footer exposes the required destinations on every page", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    for (const path of ["/", "/pricing", "/security"]) {
      await page.goto(path);
      const footer = page.locator("footer");
      for (const label of ["Product", "Pricing", "Crecy Living", "Security", "Pilot", "Log in", "Start free", "Legal documents"]) {
        await expect(footer.getByRole("link", { name: label, exact: true }), `${path} footer is missing ${label}`).toBeVisible();
      }
    }
  });
});

test.describe("pricing", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/pricing");
  });

  test("shows the canonical US monthly prices and switches to annual", async ({ page }) => {
    // These are file 11's numbers. If a generated mock's prices ever reach this page, this fails.
    for (const price of ["$0", "$15", "$49", "$129"]) {
      await expect(page.getByText(price, { exact: true }).first()).toBeVisible();
    }
    await page.getByRole("button", { name: "Annual" }).click();
    for (const price of ["$150", "$490", "$1,290"]) {
      await expect(page.getByText(price, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("2 months free").first()).toBeVisible();
  });

  test("switches price books between the three countries", async ({ page }) => {
    await page.getByRole("button", { name: "Canada" }).click();
    await expect(page.getByText("C$69", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Prices are shown in CAD/)).toBeVisible();

    await page.getByRole("button", { name: "Mexico" }).click();
    await expect(page.getByText("MX$799", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Prices are shown in MXN/)).toBeVisible();

    await page.getByRole("button", { name: "United States" }).click();
    await expect(page.getByText("$49", { exact: true }).first()).toBeVisible();
  });

  test("states the overage rate, the custom-agreement threshold and the 30-day trial", async ({ page }) => {
    await expect(page.getByText(/\$0\.75 per additional active unit per month/)).toBeVisible();
    await expect(page.getByText(/500\+ units/)).toBeVisible();
    await expect(page.getByText(/30-day Growth trial, no card required/).first()).toBeVisible();
  });

  test("discloses how rent money moves", async ({ page }) => {
    await expect(page.getByText(/separate from rent collection/i).first()).toBeVisible();
    await expect(page.getByText(/no transaction or application fee on resident rent/i).first()).toBeVisible();
    await expect(page.getByText(/does not hold resident rent/i).first()).toBeVisible();
  });

  test("the comparison table scrolls inside itself rather than widening the page", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/pricing");
    const wrapper = page.locator("table").locator("xpath=..");
    await expect(wrapper).toHaveCSS("overflow-x", "auto");
    await assertNoHorizontalOverflow(page, "/pricing (phone, comparison table)");
  });
});

test.describe("indexing policy", () => {
  test("robots.txt blocks the authenticated product and allows the marketing pages", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const body = await response.text();
    for (const prefix of ["/app", "/owner", "/platform", "/settings", "/home", "/login", "/signup", "/api"]) {
      expect(body, `${prefix} is not disallowed`).toContain(`Disallow: ${prefix}\n`);
    }
    for (const route of ["/product", "/pricing", "/crecy-living", "/security", "/pilot"]) {
      expect(body).not.toContain(`Disallow: ${route}`);
    }
    expect(body).toContain("Sitemap:");
  });

  test("the sitemap lists the public routes and nothing authenticated", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    const body = await response.text();
    for (const route of ["/product", "/pricing", "/crecy-living", "/security", "/pilot", "/legal"]) {
      expect(body, `${route} is missing from the sitemap`).toContain(`${route}<`);
    }
    for (const route of ["/app", "/settings", "/platform", "/home<"]) {
      expect(body, `${route} should not be in the sitemap`).not.toContain(`${route}<`);
    }
  });

  test("a legal document page carries its own metadata and the public shell", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/legal");
    await page.getByTestId("legal-link-operator_terms").click();
    await page.waitForURL("**/legal/operator-terms");
    // The legal centre sits inside the marketing shell, so a visitor reading the terms can still reach
    // the rest of the site — and the page must not nest a second <main> inside the layout's.
    await expect(page.locator("header").getByRole("link", { name: "Pricing" })).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByTestId("legal-content-hash")).toContainText("SHA-256");
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    // A draft that reads as binding is the failure the registry exists to prevent, so the state is in
    // the description too — a search result is read out of context by definition.
    expect(description).toMatch(/version .+ effective .+ This version is (published|draft)/i);
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(/\/legal\/operator-terms$/);
  });

  test("each public page carries a unique title, description and canonical", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const seen = new Map<string, string>();
    for (const path of ["/", "/product", "/pricing", "/crecy-living", "/security", "/pilot"]) {
      await page.goto(path);
      const title = await page.title();
      const description = await page.locator('meta[name="description"]').getAttribute("content");
      const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute("href");
      const ogUrl = await page.locator('meta[property="og:url"]').getAttribute("content");
      expect(title, `${path} has no title`).toBeTruthy();
      expect(description, `${path} has no description`).toBeTruthy();
      expect(canonicalHref, `${path} has no canonical`).toBeTruthy();
      expect(ogUrl, `${path} canonical and og:url disagree`).toBe(canonicalHref);
      expect(seen.has(title), `${path} reuses the title of ${seen.get(title)}`).toBe(false);
      seen.set(title, path);
    }
  });
});
