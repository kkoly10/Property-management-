import type { Metadata } from "next";

/**
 * The canonical public MARKETING origin — crecyos.com, not the operator app.
 *
 * FD-037 fixes the domain architecture: `crecyos.com` is the marketing host and `app.crecyos.com` is
 * the Crecy OS operator entry. Metadata must name the marketing host explicitly rather than inferring
 * it from whatever host served the request, or a preview deployment would publish canonicals pointing
 * at itself and `app.crecyos.com` would advertise itself as the marketing root.
 *
 * The two hosts are NOT interchangeable and neither is derived from the other by string manipulation:
 * the operator origin is its own configuration value (NEXT_PUBLIC_SITE_URL).
 *
 * A configured value that is not a valid absolute http(s) origin throws at module load rather than
 * silently publishing canonicals for a malformed host.
 */
const DEFAULT_MARKETING_ORIGIN = "https://crecyos.com";

function readMarketingOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_MARKETING_ORIGIN?.trim();
  if (!configured) return DEFAULT_MARKETING_ORIGIN;
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(`NEXT_PUBLIC_MARKETING_ORIGIN is not a valid absolute URL: ${configured}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`NEXT_PUBLIC_MARKETING_ORIGIN must be http(s): ${configured}`);
  }
  return `${parsed.origin}`;
}

export const MARKETING_ORIGIN = readMarketingOrigin();

export function canonical(path: string): string {
  return `${MARKETING_ORIGIN}${path === "/" ? "" : path}`;
}

/**
 * Page metadata for a public marketing route: unique title and description, a canonical URL, and Open
 * Graph. Nothing here states a claim file 18 would require evidence for.
 */
export function marketingMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = canonical(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "Crecy",
      title: `${title} · Crecy`,
      description,
      url,
      locale: "en_US",
      images: [{ url: canonical("/opengraph-image"), width: 1200, height: 630, alt: "Crecy — Global rental operations, made clear." }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Crecy`,
      description,
      images: [canonical("/opengraph-image")],
    },
  };
}
