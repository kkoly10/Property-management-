import type { MetadataRoute } from "next";
import { MARKETING_ORIGIN } from "@/lib/marketing/metadata";
import { PRIVATE_PREFIXES } from "@/lib/marketing/navigation";

/**
 * Public marketing is indexable; the authenticated product is not.
 *
 * The disallow list is derived from the same constant the navigation uses, so a new private surface
 * cannot become indexable simply because nobody remembered to add it here.
 *
 * The prefixes are emitted WITHOUT a trailing slash on purpose. robots.txt matching is a prefix match,
 * so `/login` covers both `/login` and `/login/...`, whereas `/login/` would leave the bare `/login`
 * page — which is a real page — crawlable. No public route shares a prefix with a private one, and a
 * test asserts that.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PREFIXES] }],
    sitemap: `${MARKETING_ORIGIN}/sitemap.xml`,
    host: MARKETING_ORIGIN,
  };
}
