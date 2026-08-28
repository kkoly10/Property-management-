import type { MetadataRoute } from "next";
import { canonical } from "@/lib/marketing/metadata";
import { PUBLIC_ROUTES } from "@/lib/marketing/navigation";
import { listLegalDocuments } from "@/lib/legal/registry";

/**
 * Only public routes. Generated from the same route list the navigation renders, plus the published
 * legal artifacts, so the sitemap cannot advertise a page that does not exist or omit one that does.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    ...PUBLIC_ROUTES.map((route) => ({
      url: canonical(route.href),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: route.href === "/" ? 1 : 0.7,
    })),
    ...listLegalDocuments().map((document) => ({
      url: canonical(document.route),
      lastModified: new Date(document.effectiveDate),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
