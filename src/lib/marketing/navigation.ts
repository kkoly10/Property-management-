/**
 * The public navigation and footer, in one place so the header, the mobile menu, the footer and the
 * sitemap cannot disagree about what exists.
 */
export type MarketingRoute = { href: string; label: string; description: string };

export const MARKETING_ROUTES: MarketingRoute[] = [
  { href: "/product", label: "Product", description: "How Crecy handles portfolio, leasing, rent, maintenance, documents and owner visibility." },
  { href: "/pricing", label: "Pricing", description: "Plans, included units and payment disclosure for the United States, Canada and Mexico." },
  { href: "/crecy-living", label: "Crecy Living", description: "The resident experience: balance, payments, receipts, maintenance and documents." },
  { href: "/security", label: "Security", description: "How Crecy isolates tenants, scopes access and records what happened." },
  { href: "/pilot", label: "Pilot", description: "Join the Crecy early program." },
];

/** Routes the marketing site links to that are not marketing pages. */
export const LEGAL_ROUTES: MarketingRoute[] = [
  { href: "/legal", label: "Legal documents", description: "Every version Crecy has published, and the state it is in." },
];

/**
 * Everything a crawler should see. Authenticated product routes are deliberately absent — they are
 * disallowed in robots.txt and excluded here, so an app screen can never be indexed by omission.
 */
export const PUBLIC_ROUTES: MarketingRoute[] = [
  { href: "/", label: "Home", description: "Rental operations, finally connected." },
  ...MARKETING_ROUTES,
  ...LEGAL_ROUTES,
];

/**
 * Prefixes excluded from indexing: every authenticated surface, plus the entry points that lead into
 * one. `/login` and `/signup` belong here — they are public pages, but a search result for them is
 * worse than a search result for the marketing page that links to them.
 */
export const PRIVATE_PREFIXES = [
  "/app", "/onboarding", "/owner", "/platform", "/settings",
  "/home", "/maintenance", "/messages", "/payments", "/receipts", "/more", "/documents",
  "/login", "/signup", "/invitations", "/api",
];

/**
 * Prefixes that require a session, enforced in `src/proxy.ts`.
 *
 * This is deliberately a SUBSET of PRIVATE_PREFIXES rather than the same list: `/login`, `/signup` and
 * `/invitations` must stay reachable without a session or nobody can ever get in, and `/api` answers
 * with its own status codes rather than an HTML redirect. A test asserts the subset relation, so a
 * surface can never require a session while remaining indexable.
 */
export const AUTHENTICATED_PREFIXES = [
  "/app", "/onboarding", "/owner", "/platform", "/settings",
  "/home", "/maintenance", "/messages", "/payments", "/receipts", "/more", "/documents",
];

/**
 * Paths under an authenticated prefix that are reached WITHOUT a session, by design.
 *
 * A secure document link is redeemed anonymously — the token is the credential — so redirecting it to
 * `/login` would break the delivery mechanism for exactly the recipients who have no account.
 */
export const ANONYMOUS_EXCEPTIONS = ["/documents/secure"];

/**
 * True when a path is a public, session-independent page whose HTML is identical for every visitor.
 *
 * This is an explicit ALLOWLIST, not the inverse of `requiresSession`, and that asymmetry is the whole
 * point: caching is decided fail-closed. `/login`, `/signup`, `/invitations/accept` and `/auth/callback`
 * are reachable without a session but render per-visitor content — an invitation page names its
 * invitee — so they must never become shared-cacheable by being absent from a list of protected
 * prefixes. A new route is uncacheable until someone adds it here on purpose.
 */
export function isCacheablePublicPage(pathname: string): boolean {
  if (PUBLIC_ROUTES.some((route) => route.href === pathname)) return true;
  return pathname === "/legal" || pathname.startsWith("/legal/");
}

/** True when a request path needs an authenticated session. */
export function requiresSession(pathname: string): boolean {
  if (ANONYMOUS_EXCEPTIONS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return false;
  return AUTHENTICATED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
