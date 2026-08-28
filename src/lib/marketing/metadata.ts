import type { Metadata } from "next";

/**
 * The canonical public origin.
 *
 * File 27 §7 fixes the domain architecture: crecy.com is the marketing host and app.crecy.com is the
 * Crecy OS entry. Metadata must name the marketing host explicitly rather than inferring it from
 * whatever host served the request, or a preview deployment would publish canonicals pointing at
 * itself and app.crecy.com would advertise itself as the marketing root.
 */
export const MARKETING_ORIGIN = (process.env.NEXT_PUBLIC_MARKETING_ORIGIN ?? "https://crecy.com").replace(/\/$/, "");

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
    },
    twitter: { card: "summary_large_image", title: `${title} · Crecy`, description },
  };
}
