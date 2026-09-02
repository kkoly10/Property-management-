/**
 * One host classifier for every Crecy surface.
 *
 * Hostname comparisons live here and nowhere else. Scattering them across pages and API routes is how
 * a host check drifts out of agreement with the routing that depends on it — and two of the callers
 * (the request proxy and resident Stripe return validation) are security-sensitive, so they must be
 * reasoning about the same notion of "which Crecy surface is this".
 *
 * FD-037 fixes the architecture:
 *
 *   crecyos.com               public Crecy marketing (canonical)
 *   www.crecyos.com           308 -> crecyos.com (Vercel owns the primary redirect)
 *   app.crecyos.com           Crecy OS operator application
 *   crecyliving.com           Crecy Living resident root
 *   {community}.crecyliving.com   community resident portals
 *   owner.crecyos.com         Crecy Owner
 *   vendor.crecyos.com        reserved, not built
 *
 * THE HOST IS NOT AN AUTHORIZATION GRANT. Classification decides which surface to route to and which
 * origin a link or payment return may use. It never decides what data a caller may read: that remains
 * the authenticated user's tenancy/relationship and the RLS policies behind it. In particular a
 * community label appearing in a hostname grants access to nothing — it is presentation context.
 */

/** Labels that can never be a Crecy Living community, because they name (or could impersonate) a surface. */
export const RESERVED_COMMUNITY_LABELS = [
  "www", "app", "owner", "vendor", "admin", "api", "platform",
  "mail", "auth", "static", "assets", "cdn", "internal",
] as const;

/** A single DNS label: lowercase alphanumerics and interior hyphens, 1-63 chars. */
const COMMUNITY_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type HostClassification =
  | { kind: "marketing" }
  | { kind: "app" }
  | { kind: "owner" }
  | { kind: "vendor" }
  | { kind: "living-root" }
  | { kind: "living-community"; community: string }
  /** localhost, 127.0.0.1 and *.vercel.app: every surface is reachable, as it is today. */
  | { kind: "development" }
  /** Anything else in production. Callers must fail closed rather than render Crecy. */
  | { kind: "unknown" };

export type HostKind = HostClassification["kind"];

/** Lowercase, drop any port, drop a trailing root dot. Returns "" for a missing/blank host. */
export function normalizeHostname(host: string | null | undefined): string {
  if (!host) return "";
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return "";
  // IPv6 literals arrive bracketed; the port follows the closing bracket.
  const withoutPort = trimmed.startsWith("[")
    ? trimmed.slice(0, trimmed.indexOf("]") + 1)
    : trimmed.split(":")[0];
  return withoutPort.replace(/\.$/, "");
}

function hostnameOf(rawOrigin: string | undefined, fallback: string): string {
  if (!rawOrigin) return fallback;
  const value = rawOrigin.trim();
  if (!value || value.includes("replace_me")) return fallback;
  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return fallback;
  }
}

/** The hostnames this deployment answers to, resolved from configuration once per module load. */
export function hostConfig() {
  const marketing = hostnameOf(process.env.NEXT_PUBLIC_MARKETING_ORIGIN, "crecyos.com");
  const app = hostnameOf(process.env.NEXT_PUBLIC_SITE_URL, "app.crecyos.com");
  const livingRoot = normalizeHostname(process.env.NEXT_PUBLIC_LIVING_ROOT_DOMAIN) || "crecyliving.com";
  // Owner and vendor are structural labels on the marketing apex, per FD-037. The APP host is NOT
  // derived this way: it has its own configuration because links are built from it, and deriving one
  // host from another by string surgery is exactly how app and marketing become interchangeable.
  const owner = hostnameOf(process.env.NEXT_PUBLIC_OWNER_ORIGIN, `owner.${marketing}`);
  const vendor = `vendor.${marketing}`;
  return { marketing, app, owner, vendor, livingRoot };
}

function isDevelopmentHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "0.0.0.0") return true;
  if (hostname.endsWith(".localhost")) return true;
  // Preview and the current production alias both live here. This is an explicit named allowance, not
  // a wildcard fallback, so it cannot widen what production otherwise accepts.
  return hostname === "vercel.app" || hostname.endsWith(".vercel.app");
}

export function classifyHost(rawHost: string | null | undefined): HostClassification {
  const hostname = normalizeHostname(rawHost);
  if (!hostname) return { kind: "unknown" };

  // Development FIRST, before any configured-host comparison. In local development
  // NEXT_PUBLIC_SITE_URL is http://localhost:3000, so the app-host check would otherwise match
  // "localhost" and classify every local request as the operator host — redirecting localhost/ to
  // /app and making the marketing site undevelopable.
  if (isDevelopmentHost(hostname)) return { kind: "development" };

  const { marketing, app, owner, vendor, livingRoot } = hostConfig();

  if (hostname === app) return { kind: "app" };
  if (hostname === owner) return { kind: "owner" };
  if (hostname === vendor) return { kind: "vendor" };
  if (hostname === marketing || hostname === `www.${marketing}`) return { kind: "marketing" };
  if (hostname === livingRoot || hostname === `www.${livingRoot}`) return { kind: "living-root" };

  if (hostname.endsWith(`.${livingRoot}`)) {
    const label = hostname.slice(0, -(livingRoot.length + 1));
    // Exactly one label deep: a.b.crecyliving.com is not a community.
    if (!label.includes(".") && COMMUNITY_LABEL.test(label)
      && !(RESERVED_COMMUNITY_LABELS as readonly string[]).includes(label)) {
      return { kind: "living-community", community: label };
    }
    return { kind: "unknown" };
  }

  return { kind: "unknown" };
}

/** True when the host is a Crecy Living surface residents may legitimately be served from. */
export function isLivingSurface(classification: HostClassification): boolean {
  return classification.kind === "living-root" || classification.kind === "living-community";
}

/**
 * The exact https origin for a request host, for building or validating an absolute URL against the
 * host the request actually arrived on. Returns null for hosts that are not a recognized surface.
 *
 * Development hosts keep their scheme and port, because localhost:3000 is not https and Playwright
 * would otherwise have no reachable origin.
 */
export function originForRequestHost(rawHost: string | null | undefined, protocol = "https:"): string | null {
  const hostname = normalizeHostname(rawHost);
  if (!hostname) return null;
  const classification = classifyHost(rawHost);
  if (classification.kind === "unknown") return null;
  if (classification.kind === "development") {
    const host = (rawHost ?? "").trim().toLowerCase().replace(/\.$/, "");
    const scheme = protocol === "http:" || hostname === "localhost" || hostname.endsWith(".localhost") ? "http:" : "https:";
    return `${scheme}//${host}`;
  }
  return `https://${hostname}`;
}

/** The configured operator-application origin, or "" when it is unset or still a placeholder. */
export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured || configured.includes("replace_me")) return "";
  if (!/^https?:\/\//i.test(configured)) return "";
  return configured.replace(/\/+$/, "");
}

/**
 * True when this deployment's operator origin is a local/preview host.
 *
 * Development keeps every audience on one origin. Pointing a resident link at
 * https://crecyliving.com while running on localhost would emit a production URL into a dev inbox and
 * break Playwright, so the audience split only takes effect once the app origin is a real Crecy host.
 */
export function originsAreLocal(): boolean {
  const origin = appOrigin();
  if (!origin) return true;
  try {
    return classifyHost(new URL(origin).host).kind === "development";
  } catch {
    return true;
  }
}

/** Audiences that receive absolute links, each with its own canonical origin under FD-037. */
export type LinkAudience = "operator" | "resident" | "owner";

/**
 * The origin an absolute link for this audience must use.
 *
 * Derived from the recipient's relationship, never from the sender's host: an owner invitation goes to
 * owner.crecyos.com even though an operator on app.crecyos.com triggered it.
 */
export function originForAudience(audience: LinkAudience): string {
  const app = appOrigin();
  if (originsAreLocal()) return app;
  const { owner, livingRoot } = hostConfig();
  if (audience === "owner") return `https://${owner}`;
  // No authoritative community host is known at send time, so the Living root is the safe destination.
  if (audience === "resident") return `https://${livingRoot}`;
  return app;
}
