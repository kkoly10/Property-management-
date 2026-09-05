import { describe, expect, it } from "vitest";
import { AUTH_SURFACE_COPY, authSurfaceFor, type AuthSurface } from "./surface-copy";
import { classifyHost } from "@/lib/runtime/host";

describe("which audience the sign-in screen is addressing", () => {
  it("routes each Crecy surface to its own copy", () => {
    expect(authSurfaceFor({ kind: "living-root" })).toBe("resident");
    expect(authSurfaceFor({ kind: "living-community", community: "maple-court" })).toBe("resident");
    expect(authSurfaceFor({ kind: "owner" })).toBe("owner");
    expect(authSurfaceFor({ kind: "app" })).toBe("operator");
  });

  it("falls back to the operator surface for development and unrecognized hosts", () => {
    // Local development reaches every surface from one origin; anything else makes the operator app
    // undevelopable, which is the same reason classifyHost checks development first.
    expect(authSurfaceFor({ kind: "development" })).toBe("operator");
    expect(authSurfaceFor({ kind: "unknown" })).toBe("operator");
    expect(authSurfaceFor({ kind: "marketing" })).toBe("operator");
    expect(authSurfaceFor({ kind: "vendor" })).toBe("operator");
  });

  it("never offers a self-serve trial to someone who arrives by invitation", () => {
    // A resident or owner cannot create their own tenancy or ownership interest. Showing them
    // "Start a trial" invites them to create an organization they will then be alone inside.
    expect(AUTH_SURFACE_COPY.resident.showTrialLink).toBe(false);
    expect(AUTH_SURFACE_COPY.owner.showTrialLink).toBe(false);
    expect(AUTH_SURFACE_COPY.operator.showTrialLink).toBe(true);
  });

  it("asks a resident for an email, not a work email", () => {
    expect(AUTH_SURFACE_COPY.resident.emailLabel).toBe("Email");
    expect(AUTH_SURFACE_COPY.owner.emailLabel).toBe("Email");
    expect(AUTH_SURFACE_COPY.operator.emailLabel).toBe("Work email");
  });

  it("addresses nobody as an operator unless they are one", () => {
    // The regression this module exists to prevent: a renter told to continue to their "operator
    // workspace", under a headline about operating a portfolio and keeping multi-currency books.
    for (const surface of ["resident", "owner"] as AuthSurface[]) {
      const copy = AUTH_SURFACE_COPY[surface];
      const prose = [copy.headline, copy.description, copy.eyebrow, ...copy.promises.map((p) => p.text)].join(" ").toLowerCase();
      expect(prose).not.toContain("operator");
      expect(prose).not.toContain("operate");
    }
  });

  it("wears the brand lockup of the product being signed in to", () => {
    // The portals already do this: resident pages render "Crecy | Living", owner pages
    // "Crecy | Owner", the operator app the bare wordmark. Signing in should not look generic.
    expect(AUTH_SURFACE_COPY.resident.product).toBe("Living");
    expect(AUTH_SURFACE_COPY.owner.product).toBe("Owner");
    expect(AUTH_SURFACE_COPY.operator.product).toBeUndefined();
  });

  it("gives every surface a complete panel", () => {
    for (const copy of Object.values(AUTH_SURFACE_COPY)) {
      expect(copy.promises).toHaveLength(3);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.footnote.length).toBeGreaterThan(0);
    }
  });

  it("classifies the real production hostnames to the surfaces they serve", () => {
    // Guards the wiring end to end: a hostname the DNS actually points at Crecy must reach the copy
    // written for it, not merely a HostClassification that looks plausible in isolation.
    //
    // The production host values are set explicitly rather than inherited from whatever .env the
    // suite happens to run under. Without this the assertions pass for the WRONG reason: under the
    // local env, marketing resolves to "localhost", so owner.crecyos.com classifies as `unknown`,
    // which also falls back to "operator" — a test that cannot fail is not a test.
    const previous = {
      site: process.env.NEXT_PUBLIC_SITE_URL,
      marketing: process.env.NEXT_PUBLIC_MARKETING_ORIGIN,
      living: process.env.NEXT_PUBLIC_LIVING_ROOT_DOMAIN,
    };
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.crecyos.com";
    process.env.NEXT_PUBLIC_MARKETING_ORIGIN = "https://crecyos.com";
    process.env.NEXT_PUBLIC_LIVING_ROOT_DOMAIN = "crecyliving.com";
    try {
      expect(classifyHost("owner.crecyos.com").kind).toBe("owner");
      expect(authSurfaceFor(classifyHost("owner.crecyos.com"))).toBe("owner");
      expect(authSurfaceFor(classifyHost("crecyliving.com"))).toBe("resident");
      expect(authSurfaceFor(classifyHost("maple.crecyliving.com"))).toBe("resident");
      expect(authSurfaceFor(classifyHost("app.crecyos.com"))).toBe("operator");
      // A community label that impersonates a surface is not a resident portal.
      expect(authSurfaceFor(classifyHost("app.crecyliving.com"))).toBe("operator");
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = previous.site;
      process.env.NEXT_PUBLIC_MARKETING_ORIGIN = previous.marketing;
      process.env.NEXT_PUBLIC_LIVING_ROOT_DOMAIN = previous.living;
    }
  });

  it("lands each surface on its own home rather than the operator workspace", () => {
    // The other half of the same defect: signing in without a `next` sent everybody to /app.
    expect(AUTH_SURFACE_COPY.resident.homePath).toBe("/home");
    expect(AUTH_SURFACE_COPY.owner.homePath).toBe("/owner");
    expect(AUTH_SURFACE_COPY.operator.homePath).toBe("/app");
  });
});
