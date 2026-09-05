import "server-only";

import { cache } from "react";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { DataMode } from "@/lib/data/maintenance";

export type LivingCommunityPresentation = {
  tenancyId?: string;
  isDemo?: boolean;
  subdomain: string;
  displayName: string;
  publicAddressText: string | null;
  headline: string | null;
  leasingEmail: string | null;
  leasingPhoneE164: string | null;
  officeHours: string[];
  amenities: string[];
  heroImageUrl: string | null;
  lobbyImageUrl: string | null;
  courtyardImageUrl: string | null;
  modelHomeImageUrl: string | null;
  publicNoticeTitle: string | null;
  publicNoticeBody: string | null;
};

export const MAPLE_COURT_DEMO_PRESENTATION: LivingCommunityPresentation = {
  tenancyId: "20000000-0000-4000-8000-000000000002",
  isDemo: true,
  subdomain: "maplecourt",
  displayName: "Maple Court",
  publicAddressText: null,
  headline: "Welcome home.",
  leasingEmail: null,
  leasingPhoneE164: null,
  officeHours: [],
  amenities: ["Resident lounge", "Landscaped courtyard", "Outdoor grilling"],
  heroImageUrl: "/media/maple-court/exterior.webp",
  lobbyImageUrl: "/media/maple-court/lobby.webp",
  courtyardImageUrl: "/media/maple-court/courtyard.webp",
  modelHomeImageUrl: "/media/maple-court/model-home.webp",
  publicNoticeTitle: null,
  publicNoticeBody: null,
};

const strings = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string")
  : [];

const nullableString = (value: unknown) => value == null ? null : String(value);
const mediaUrl = (value: unknown) => {
  const url = nullableString(value);
  if (!url?.startsWith("/media/")) return null;
  if (url.includes("..") || url.includes("?") || url.includes("#") || url.includes("\\")) return null;
  return /^\/media\/[a-z0-9][a-z0-9/_-]*\.(?:webp|png|jpe?g)$/i.test(url) ? url : null;
};

function normalize(value: unknown): LivingCommunityPresentation | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!item.subdomain || !item.displayName) return null;

  return {
    tenancyId: item.tenancyId ? String(item.tenancyId) : undefined,
    isDemo: false,
    subdomain: String(item.subdomain),
    displayName: String(item.displayName),
    publicAddressText: nullableString(item.publicAddressText),
    headline: nullableString(item.headline),
    leasingEmail: nullableString(item.leasingEmail),
    leasingPhoneE164: nullableString(item.leasingPhoneE164),
    officeHours: strings(item.officeHours),
    amenities: strings(item.amenities),
    heroImageUrl: mediaUrl(item.heroImageUrl),
    lobbyImageUrl: mediaUrl(item.lobbyImageUrl),
    courtyardImageUrl: mediaUrl(item.courtyardImageUrl),
    modelHomeImageUrl: mediaUrl(item.modelHomeImageUrl),
    publicNoticeTitle: nullableString(item.publicNoticeTitle),
    publicNoticeBody: nullableString(item.publicNoticeBody),
  };
}

/**
 * Resolve the public-safe presentation for an explicit Living community host.
 *
 * Maple Court is the repository's deterministic design/demo community. Its
 * bundled media remains available on maplecourt.crecyliving.com even before
 * the database migration is applied. No other unknown community receives a
 * fabricated profile.
 */
export const getPublicLivingCommunityPresentation = cache(async (
  subdomain: string,
): Promise<LivingCommunityPresentation | null> => {
  const normalizedSubdomain = subdomain.trim().toLowerCase();
  if (!normalizedSubdomain) return null;

  if (!getPublicSupabaseConfig()) {
    return normalizedSubdomain === MAPLE_COURT_DEMO_PRESENTATION.subdomain
      ? MAPLE_COURT_DEMO_PRESENTATION
      : null;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_living_community_profile", {
      p_subdomain: normalizedSubdomain,
    });
    if (error) throw error;
    const profile = normalize(data);
    if (profile) return profile;
  } catch {
    // The public profile is enhancement-only during migration rollout. Never
    // substitute an unrelated community. Maple Court is the sole named demo.
  }

  return normalizedSubdomain === MAPLE_COURT_DEMO_PRESENTATION.subdomain
    ? MAPLE_COURT_DEMO_PRESENTATION
    : null;
});

export const getResidentLivingCommunityPresentations = cache(async (): Promise<{
  mode: DataMode;
  items: LivingCommunityPresentation[];
  requestId?: string;
}> => {
  if (!getPublicSupabaseConfig()) {
    return { mode: "setup", items: [MAPLE_COURT_DEMO_PRESENTATION] };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_resident_living_community_profiles");
    if (error || !data) throw error ?? new Error("Community presentation is unavailable.");
    const raw = (data as Record<string, unknown> | null)?.items;
    const items = Array.isArray(raw) ? raw.flatMap((item) => {
      const profile = normalize(item);
      return profile ? [profile] : [];
    }) : [];
    return { mode: "ready", items };
  } catch {
    return {
      mode: "error",
      items: [],
      requestId: crypto.randomUUID(),
    };
  }
});
