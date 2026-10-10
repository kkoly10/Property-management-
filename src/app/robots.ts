import type { MetadataRoute } from "next";
import { MARKETING_ORIGIN } from "@/lib/marketing/metadata";
import { PRIVATE_PREFIXES, UNINDEXED_PUBLIC_PREFIXES } from "@/lib/marketing/navigation";

/**
 * Public marketing is indexable; the authenticated product is not.
 *
 * The disallow list is derived from the same constant the navigation uses, so a new private surface
 * cannot become indexable simply because nobody remembered to add it here.
 *
 * Session/private prefixes are emitted WITHOUT a trailing slash on purpose: `/login` must cover the
 * bare page too. The unlisted share family is the deliberate exception: `/l/` has no bare page and
 * must keep `/landlords` indexable. Tests assert both sides of that distinction.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PREFIXES, ...UNINDEXED_PUBLIC_PREFIXES] }],
    sitemap: `${MARKETING_ORIGIN}/sitemap.xml`,
    host: MARKETING_ORIGIN,
  };
}
