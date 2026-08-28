import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { MARKETING_ORIGIN, canonical, marketingMetadata } from "./metadata";
import {
  ANONYMOUS_EXCEPTIONS,
  AUTHENTICATED_PREFIXES,
  LEGAL_ROUTES,
  MARKETING_ROUTES,
  PRIVATE_PREFIXES,
  PUBLIC_ROUTES,
  isCacheablePublicPage,
  requiresSession,
} from "./navigation";

const APP = resolve(__dirname, "../../app");
const MARKETING_DIR = join(APP, "(marketing)");

/** Every page under the public marketing route group, as `[route, source]`. */
function marketingPages(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string, route: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, `${route}/${entry}`);
      else if (entry === "page.tsx") out.push([route === "" ? "/" : route, readFileSync(full, "utf8")]);
    }
  };
  walk(MARKETING_DIR, "");
  return out.sort(([a], [b]) => a.localeCompare(b));
}

const ALL_PAGES = marketingPages();

/**
 * The dynamic legal-document route is a template rather than a page: its title, description and h1 come
 * from the registry at render time, so the static assertions below cannot read them out of the source.
 * Its metadata is asserted in the browser suite instead, where the rendered values exist.
 */
const TEMPLATE_ROUTES = ["/legal/[documentSlug]"];
const PAGES = ALL_PAGES.filter(([route]) => !TEMPLATE_ROUTES.includes(route));

describe("the public marketing route group", () => {
  it("has a page for every advertised route and advertises every page", () => {
    // The header, the footer, the sitemap and the filesystem must agree. A link in the nav to a route
    // with no page is a 404 in production; a page missing from PUBLIC_ROUTES is missing from the
    // sitemap and from the nav, which is how a launch page silently ships unreachable.
    const built = PAGES.map(([route]) => route);
    const advertised = ["/", ...MARKETING_ROUTES.map((route) => route.href), ...LEGAL_ROUTES.map((route) => route.href)];
    expect(built.sort()).toEqual(advertised.sort());
    // The legal centre lives inside the marketing shell so it carries the public header and footer.
    expect(ALL_PAGES.map(([route]) => route)).toContain("/legal/[documentSlug]");
  });

  it("no longer redirects the marketing root at signup", () => {
    // File 27 §6: "The root route must no longer redirect directly to signup on the public marketing
    // host." The old src/app/page.tsx did exactly that, and its removal is the requirement.
    expect(() => statSync(join(APP, "page.tsx"))).toThrow();
    const [route, source] = PAGES.find(([r]) => r === "/")!;
    expect(route).toBe("/");
    expect(source).not.toMatch(/redirect\(/);
    expect(source).toContain("Rental operations, finally connected.");
  });

  it("gives every page exactly one h1 and a unique title, description and canonical", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const [route, source] of PAGES) {
      expect(source, `${route} has no metadata`).toContain("marketingMetadata(");
      const h1 = source.match(/<h1[\s>]/g) ?? [];
      expect(h1.length, `${route} should have exactly one h1`).toBe(1);
      const title = /title:\s*\n?\s*"((?:[^"\\]|\\.)*)"/.exec(source)?.[1];
      const description = /description:\s*\n?\s*"((?:[^"\\]|\\.)*)"/.exec(source)?.[1];
      expect(title, `${route} has no metadata title`).toBeTruthy();
      expect(description, `${route} has no metadata description`).toBeTruthy();
      expect(titles.has(title!), `${route} reuses the title "${title}"`).toBe(false);
      expect(descriptions.has(description!), `${route} reuses its description`).toBe(false);
      titles.add(title!);
      descriptions.add(description!);
    }
  });
});

/**
 * Source with comments removed.
 *
 * The claims test must measure what a visitor reads, not what the file says. Without this the
 * /security page fails its own guard, because it explains in a comment which phrases file 18 bans —
 * and a guard that forces you to stop naming the rule is a guard that will be deleted.
 */
function visibleCopy(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    // Attribute values are not copy. Leaving them in lets a class list like "font-semibold" satisfy a
    // proximity check that was supposed to be satisfied by an actual word in a sentence.
    .replace(/\b[\w-]+=(?:"[^"]*"|\{[^}]*\})/g, " ");
}

describe("claims on the public pages", () => {
  // The shared header, footer and section components carry copy too — the footer is where an
  // availability or certification claim would most plausibly be added — so they are scanned with the
  // pages rather than trusted.
  const COMPONENT_DIR = resolve(__dirname, "../../components/marketing");
  const components = readdirSync(COMPONENT_DIR)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => readFileSync(join(COMPONENT_DIR, file), "utf8"));
  const copy = [...PAGES.map(([, source]) => source), ...components].map(visibleCopy).join("\n");

  // Each pattern is a claim file 18 §1 prohibits outright. The /security page deliberately DENIES some
  // of these ("Crecy holds no SOC 2 or equivalent certification"), so the patterns are written to match
  // the claim, not the topic — e.g. "SOC 2 compliant", never the bare string "SOC 2".
  const PROHIBITED: [RegExp, string][] = [
    [/SOC\s*2[- ](compliant|certified)/i, "SOC 2 certification claim"],
    [/enterprise[- ]grade security/i, "certification-equivalent security claim"],
    [/\btrusted by\b/i, "customer evidence"],
    [/\b\d{2,3}(\.\d+)?%\s*uptime/i, "uptime figure"],
    [/\b(over|more than)\s+[\d,]+\s+(units|customers|operators|properties)\s+(managed|under management|trust)/i, "traction count"],
    [/\binstant(ly)?\s+(settle|settlement|payout|deposit|transfer)/i, "instant settlement claim"],
    [/\b(guarantee[ds]?|guaranteeing)\s+(security|uptime|privacy|delivery|no downtime)/i, "guarantee"],
    [/\bzero (downtime|fraud)\b/i, "absolute claim"],
    [/\bpenetration[- ]tested\b/i, "pen-test claim"],
    [/\bnationwide compliant\b|\blegally compliant leases\b/i, "legal certification claim"],
    [/\bWCAG 2\.2 AA\b(?!\s*(target|is what))(?=[^.]*\b(compliant|certified|conformant)\b)/i, "accessibility conformance claim"],
  ];

  it.each(PROHIBITED)("never makes the claim %s (%s)", (pattern) => {
    const hit = pattern.exec(copy);
    expect(hit?.[0] ?? null).toBeNull();
  });

  it("mentions SOC 2 only to deny holding one", () => {
    // File 18 §1 bans the claim, not the topic — and saying nothing at all is worse than saying plainly
    // that there is no report, because silence reads as an omission. So every mention of SOC 2 must sit
    // next to a negation. Checked on a proximity window rather than a sentence split, because the source
    // is JSX and "sentences" in it are not what a reader sees.
    const mentions = [...copy.matchAll(/SOC\s*2/gi)];
    expect(mentions.length, "the security page should address SOC 2 explicitly").toBeGreaterThan(0);
    for (const mention of mentions) {
      const window = copy.slice(Math.max(0, mention.index - 120), mention.index + 120);
      expect(window, `unqualified SOC 2 mention near: ${window.trim()}`).toMatch(/\b(no|not|none|without|never)\b/i);
    }
    // And the denial itself must be present, in words, not merely implied by omission.
    expect(copy.replace(/\s+/g, " ")).toMatch(/holds no SOC 2 or equivalent certification/i);
  });

  it("keeps the approved availability wording rather than declaring countries available", () => {
    // File 18 §1: country availability may not be claimed before the launch gates pass.
    expect(copy).toMatch(/availability is being prepared/i);
    expect(copy).not.toMatch(/\b(now )?available in (the United States|Canada|Mexico)\b/i);
  });

  it("labels every product composition as sample data", () => {
    // File 18 §4: demo dashboards display "Sample data". The label lives on the shared component so it
    // cannot be omitted per-instance, and this asserts that is still true.
    const component = readFileSync(resolve(__dirname, "../../components/marketing/sections.tsx"), "utf8");
    expect(component).toContain("Sample data");
    for (const [route, source] of PAGES) {
      const uses = (source.match(/<ProductComposition/g) ?? []).length;
      if (uses > 0) expect(source, `${route} hand-rolls a composition`).not.toMatch(/data-sample-exempt/);
    }
  });

  it("carries the operator-document disclaimer wherever documents are described to residents", () => {
    const living = PAGES.find(([route]) => route === "/crecy-living")![1];
    expect(living).toMatch(/Crecy has not verified their legal sufficiency/i);
  });
});

describe("indexing policy", () => {
  const rules = robots();
  const rule = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules!;
  const disallow = ([] as string[]).concat(rule.disallow ?? []);

  it("blocks every authenticated surface, including its bare path", () => {
    // robots.txt is a prefix match, so a trailing slash would leave the bare /login page crawlable.
    for (const prefix of PRIVATE_PREFIXES) {
      expect(disallow, `${prefix} is indexable`).toContain(prefix);
      expect(disallow, `${prefix} is blocked only as a directory`).not.toContain(`${prefix}/`);
    }
  });

  it("does not accidentally block a public route", () => {
    // The failure this prevents: adding a private prefix like "/p" that also swallows "/pricing" and
    // "/pilot", de-indexing the launch surface without any visible error.
    for (const route of PUBLIC_ROUTES) {
      const blocked = disallow.find((prefix) => route.href.startsWith(prefix));
      expect(blocked, `${route.href} is blocked by ${blocked}`).toBeUndefined();
    }
  });

  it("points crawlers at the marketing origin, not whatever host served the request", () => {
    expect(rules.sitemap).toBe(`${MARKETING_ORIGIN}/sitemap.xml`);
    expect(rules.host).toBe(MARKETING_ORIGIN);
    expect(MARKETING_ORIGIN).not.toMatch(/\/$/);
  });
});

describe("the sitemap", () => {
  const entries = sitemap();

  it("lists every public route exactly once, as an absolute canonical URL", () => {
    for (const route of PUBLIC_ROUTES) {
      const found = entries.filter((entry) => entry.url === canonical(route.href));
      expect(found.length, `${route.href} appears ${found.length} times`).toBe(1);
    }
    expect(new Set(entries.map((e) => e.url)).size).toBe(entries.length);
  });

  it("never lists an authenticated route", () => {
    for (const entry of entries) {
      const path = entry.url.slice(MARKETING_ORIGIN.length);
      const blocked = PRIVATE_PREFIXES.find((prefix) => path.startsWith(prefix));
      expect(blocked, `${entry.url} is a private surface`).toBeUndefined();
    }
  });
});

describe("page metadata", () => {
  it("canonicalizes the root without a trailing slash and others with their path", () => {
    expect(canonical("/")).toBe(MARKETING_ORIGIN);
    expect(canonical("/pricing")).toBe(`${MARKETING_ORIGIN}/pricing`);
  });

  it("emits Open Graph and Twitter cards pointing at the canonical URL", () => {
    const meta = marketingMetadata({ title: "Pricing", description: "Plans.", path: "/pricing" });
    expect(meta.alternates?.canonical).toBe(`${MARKETING_ORIGIN}/pricing`);
    expect(meta.openGraph).toMatchObject({ url: `${MARKETING_ORIGIN}/pricing`, siteName: "Crecy" });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });
});

describe("host and route classification", () => {
  it("never leaves a session-gated surface indexable", () => {
    // The invariant: anything the proxy redirects to /login must also be disallowed to crawlers. The
    // reverse does not hold — /login and /signup are indexable-forbidden but session-free by necessity.
    for (const prefix of AUTHENTICATED_PREFIXES) {
      expect(PRIVATE_PREFIXES, `${prefix} requires a session but is indexable`).toContain(prefix);
    }
  });

  it("gates the authenticated product and lets the public surface through", () => {
    for (const prefix of AUTHENTICATED_PREFIXES) {
      expect(requiresSession(prefix), `${prefix} is ungated`).toBe(true);
      expect(requiresSession(`${prefix}/anything`), `${prefix}/anything is ungated`).toBe(true);
    }
    for (const route of PUBLIC_ROUTES) {
      expect(requiresSession(route.href), `${route.href} demands a session`).toBe(false);
    }
    for (const entry of ["/login", "/signup", "/invitations/accept", "/auth/callback"]) {
      // Gating these would lock every new user out of the product.
      expect(requiresSession(entry), `${entry} demands a session`).toBe(false);
    }
  });

  it("lets an anonymous secure document link through its own prefix", () => {
    // /documents is session-gated, but a secure link is redeemed by recipients who have no account at
    // all — the token IS the credential. Redirecting it to /login breaks document delivery.
    for (const exception of ANONYMOUS_EXCEPTIONS) {
      expect(requiresSession(exception)).toBe(false);
      expect(requiresSession(`${exception}/some-token`)).toBe(false);
    }
    expect(requiresSession("/documents")).toBe(true);
  });

  it("does not gate a route merely because it starts with the same letters", () => {
    // "/home" must not swallow "/homepage"; prefix matching is on segment boundaries.
    expect(requiresSession("/homepage")).toBe(false);
    expect(requiresSession("/apps")).toBe(false);
    expect(requiresSession("/settingsomething")).toBe(false);
  });

  it("marks only genuinely public pages as shared-cacheable", () => {
    for (const route of PUBLIC_ROUTES) expect(isCacheablePublicPage(route.href), route.href).toBe(true);
    expect(isCacheablePublicPage("/legal/operator-terms")).toBe(true);
    // Per-visitor HTML. If any of these became cacheable, one visitor's page could be served to another.
    for (const path of ["/login", "/signup", "/invitations/accept", "/auth/callback", "/app/dashboard", "/home", "/documents/secure/abc"]) {
      expect(isCacheablePublicPage(path), `${path} must not be shared-cacheable`).toBe(false);
    }
  });

  it("keeps the proxy deciding from the shared classification rather than its own list", () => {
    const proxy = readFileSync(resolve(__dirname, "../supabase/proxy.ts"), "utf8");
    expect(proxy).toContain("requiresSession(");
    expect(proxy).toContain("isCacheablePublicPage(");
    // The old hardcoded array is what let /more and /documents drift out of protection.
    expect(proxy).not.toMatch(/const protectedPrefixes\s*=/);
  });
});
