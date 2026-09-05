import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeForHost } from "@/lib/runtime/host-routing";
import { classifyHost } from "@/lib/runtime/host";

const created = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/lib/supabase/config", () => ({
  getPublicSupabaseConfig: () => ({ url: "https://project.supabase.co", publishableKey: "sb_publishable_test" }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    created.count += 1;
    return { auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) } };
  },
}));

const { proxy } = await import("@/proxy");

beforeEach(() => {
  created.count = 0;
  vi.stubEnv("NEXT_PUBLIC_MARKETING_ORIGIN", "https://crecyos.com");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.crecyos.com");
  vi.stubEnv("NEXT_PUBLIC_LIVING_ROOT_DOMAIN", "crecyliving.com");
});

describe("host routing", () => {
  it("serves the marketing homepage on the marketing host", () => {
    expect(routeForHost("crecyos.com", "/")).toEqual({ type: "continue" });
    expect(routeForHost("crecyos.com", "/pricing")).toEqual({ type: "continue" });
    expect(routeForHost("crecyos.com", "/legal/operator-terms")).toEqual({ type: "continue" });
  });

  it("308s www to the bare marketing apex, once", () => {
    const decision = routeForHost("www.crecyos.com", "/pricing");
    expect(decision).toEqual({ type: "redirect", location: "https://crecyos.com/pricing", permanent: true });
    // The destination must not itself redirect, or the pair is a loop.
    expect(routeForHost("crecyos.com", "/pricing")).toEqual({ type: "continue" });
  });

  it("enters Crecy OS on the app host and never the marketing homepage", () => {
    expect(routeForHost("app.crecyos.com", "/")).toEqual({ type: "redirect", location: "/app", permanent: false });
    expect(routeForHost("app.crecyos.com", "/app")).toEqual({ type: "continue" });
    // and the destination does not bounce again
    expect(routeForHost("app.crecyos.com", "/app/portfolio")).toEqual({ type: "continue" });
  });

  it("enters the owner portal on the owner host", () => {
    expect(routeForHost("owner.crecyos.com", "/")).toEqual({ type: "redirect", location: "/owner", permanent: false });
    expect(routeForHost("owner.crecyos.com", "/owner")).toEqual({ type: "continue" });
  });

  it("enters the resident experience on the Living root and on a community host", () => {
    expect(routeForHost("crecyliving.com", "/")).toEqual({ type: "redirect", location: "/home", permanent: false });
    expect(routeForHost("lakewood.crecyliving.com", "/")).toEqual({ type: "redirect", location: "/home", permanent: false });
    expect(routeForHost("park-view.crecyliving.com", "/home")).toEqual({ type: "continue" });
    expect(classifyHost("lakewood.crecyliving.com")).toEqual({ kind: "living-community", community: "lakewood" });
  });

  it("does not offer self-serve signup to surfaces that arrive by invitation", () => {
    // Residents and owners cannot create their own tenancy or ownership interest, so /signup on
    // their host ends in an organization they would be alone inside. The operator surface keeps it.
    expect(routeForHost("crecyliving.com", "/signup")).toEqual({ type: "redirect", location: "/login", permanent: false });
    expect(routeForHost("lakewood.crecyliving.com", "/signup")).toEqual({ type: "redirect", location: "/login", permanent: false });
    expect(routeForHost("owner.crecyos.com", "/signup")).toEqual({ type: "redirect", location: "/login", permanent: false });
    expect(routeForHost("crecyliving.com", "/signup", "?next=%2Fhome")).toEqual({ type: "redirect", location: "/login?next=%2Fhome", permanent: false });
    // The operator surface is the one that IS self-serve, and localhost must stay developable.
    expect(routeForHost("app.crecyos.com", "/signup")).toEqual({ type: "continue" });
    expect(routeForHost("localhost:3000", "/signup")).toEqual({ type: "continue" });
    // /login itself is untouched on every surface, or the redirect above would loop.
    expect(routeForHost("crecyliving.com", "/login")).toEqual({ type: "continue" });
  });

  it("canonicalizes a marketing path reached on a product host back to marketing", () => {
    expect(routeForHost("app.crecyos.com", "/pricing"))
      .toEqual({ type: "redirect", location: "https://crecyos.com/pricing", permanent: false });
    expect(routeForHost("owner.crecyos.com", "/legal"))
      .toEqual({ type: "redirect", location: "https://crecyos.com/legal", permanent: false });
  });

  it("fails safely on an unknown production host, and on reserved Living labels", () => {
    expect(routeForHost("evil.example.com", "/")).toEqual({ type: "reject" });
    expect(routeForHost("", "/")).toEqual({ type: "reject" });
    // Reserved labels must never be mistaken for a community. `www` is the one that is not rejected:
    // it aliases the Living root the same way www.crecyos.com aliases marketing, so it is a root
    // rather than a community named "www".
    for (const label of ["app", "owner", "vendor", "admin", "api", "platform"]) {
      expect(routeForHost(`${label}.crecyliving.com`, "/"), label).toEqual({ type: "reject" });
      expect(classifyHost(`${label}.crecyliving.com`), label).toEqual({ kind: "unknown" });
    }
    expect(classifyHost("www.crecyliving.com")).toEqual({ kind: "living-root" });
    // Nested labels are not a community either.
    expect(routeForHost("a.b.crecyliving.com", "/")).toEqual({ type: "reject" });
    // vendor is reserved and unbuilt.
    expect(routeForHost("vendor.crecyos.com", "/")).toEqual({ type: "reject" });
  });

  it("keeps localhost and Vercel previews working exactly as before", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "property-management-six-plum.vercel.app"]) {
      expect(routeForHost(host, "/"), host).toEqual({ type: "continue" });
      expect(routeForHost(host, "/app"), host).toEqual({ type: "continue" });
    }
  });

  it("canonicalizes marketing /login to the app host WITHOUT constructing a session client", async () => {
    // The redirect has to happen before the Supabase client exists: a response that crossed the
    // session client could carry a rotated Set-Cookie, and this one is a plain cross-host bounce.
    const response = await proxy(new NextRequest(new URL("/login", "https://crecyos.com")));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.crecyos.com/login");
    expect(created.count).toBe(0);
  });

  it("rejects an unknown host at the proxy without constructing a session client", async () => {
    const response = await proxy(new NextRequest(new URL("/", "https://evil.example.com")));
    expect(response.status).toBe(404);
    expect(created.count).toBe(0);
  });
});
