import { classifyHost, hostConfig, normalizeHostname, type HostClassification } from "@/lib/runtime/host";
import { isCacheablePublicPage } from "@/lib/marketing/navigation";

/**
 * Where a request should go, decided from its HOST and path together.
 *
 * Every decision here is host canonicalization, and none of it needs a session — which is why it runs
 * before the Supabase client is constructed in the proxy. A redirect issued here can never carry a
 * rotated Set-Cookie, so it is safe to emit without the private/no-store discipline that applies once
 * the session client exists.
 */
export type RoutingDecision =
  /** Serve this request on this host. */
  | { type: "continue" }
  /** Send the caller elsewhere. Absolute when the host changes, path-only when it does not. */
  | { type: "redirect"; location: string; permanent: boolean }
  /** Not a Crecy surface. The caller must fail closed rather than render anything. */
  | { type: "reject" };

/**
 * Operator/auth surfaces. Reaching one on the marketing host means somebody typed or bookmarked the
 * wrong origin; the answer is to canonicalize, not to run Crecy OS on the marketing site.
 */
const APP_SURFACE_PREFIXES = [
  "/app", "/onboarding", "/settings", "/platform", "/login", "/signup", "/auth", "/invitations",
];

function underPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Root destination for each authenticated surface. The existing session gate does the rest. */
const ROOT_DESTINATION: Partial<Record<HostClassification["kind"], string>> = {
  app: "/app",
  owner: "/owner",
  "living-root": "/home",
  "living-community": "/home",
};

export function routeForHost(rawHost: string | null | undefined, pathname: string, search = ""): RoutingDecision {
  const classification = classifyHost(rawHost);
  const hostname = normalizeHostname(rawHost);
  const { marketing } = hostConfig();

  // Infrastructure paths are host-agnostic. Redirecting them would break webhooks and crawlers.
  if (pathname.startsWith("/api/") || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return classification.kind === "unknown" ? { type: "reject" } : { type: "continue" };
  }

  switch (classification.kind) {
    // Localhost, Playwright and *.vercel.app keep today's behavior exactly: every surface reachable,
    // no host redirects. Preview allowances stop here and never widen production acceptance.
    case "development":
      return { type: "continue" };

    case "unknown":
      return { type: "reject" };

    // Reserved by FD-037, nothing built behind it.
    case "vendor":
      return { type: "reject" };

    case "marketing": {
      // Defensive canonicalization; Vercel owns the primary www redirect. Guarded against a loop by
      // only firing when the host really is the www label of the marketing apex.
      if (hostname === `www.${marketing}`) {
        return { type: "redirect", location: `https://${marketing}${pathname}${search}`, permanent: true };
      }
      if (underPrefix(pathname, APP_SURFACE_PREFIXES)) {
        return { type: "redirect", location: `https://${hostConfig().app}${pathname}${search}`, permanent: false };
      }
      return { type: "continue" };
    }

    default: {
      // app | owner | living-root | living-community.
      const root = ROOT_DESTINATION[classification.kind];
      if (root && pathname === "/") {
        return { type: "redirect", location: `${root}${search}`, permanent: false };
      }
      // A marketing page reached on a product host canonicalizes back to the marketing origin, so
      // app.crecyos.com/pricing cannot become a second copy of the public site.
      if (isCacheablePublicPage(pathname)) {
        return { type: "redirect", location: `https://${marketing}${pathname}${search}`, permanent: false };
      }
      return { type: "continue" };
    }
  }
}

/**
 * Whether a pathname may be served from the shared public cache ON THIS HOST.
 *
 * Host first, path second, and that order is the security requirement: `app.crecyos.com/` has the
 * pathname `/`, and treating it as the cacheable marketing homepage on that basis alone is exactly the
 * confusion this exists to prevent.
 */
export function isCacheablePublicRequest(rawHost: string | null | undefined, pathname: string): boolean {
  const kind = classifyHost(rawHost).kind;
  if (kind !== "marketing" && kind !== "development") return false;
  return isCacheablePublicPage(pathname);
}
