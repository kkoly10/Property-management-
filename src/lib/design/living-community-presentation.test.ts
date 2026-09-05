import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authLayout = readFileSync(resolve(__dirname, "../../app/(auth)/layout.tsx"), "utf8");
const login = readFileSync(resolve(__dirname, "../../app/(auth)/login/page.tsx"), "utf8");
const stage = readFileSync(resolve(__dirname, "../../components/auth/auth-surface-stage.tsx"), "utf8");
const home = readFileSync(resolve(__dirname, "../../app/home/page.tsx"), "utf8");
const communityData = readFileSync(resolve(__dirname, "../data/living-community.ts"), "utf8");
const migration = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260905040000_phase_8_living_community_presentation.sql"), "utf8");

const media = [
  "../../../public/media/maple-court/exterior.webp",
  "../../../public/media/maple-court/lobby.webp",
  "../../../public/media/maple-court/courtyard.webp",
  "../../../public/media/maple-court/model-home.webp",
];

describe("Crecy Living community presentation", () => {
  it("ships the cohesive Maple Court media set as real repository assets", () => {
    for (const relative of media) {
      const path = resolve(__dirname, relative);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(8_000);
    }
  });

  it("resolves explicit community hosts without making host classification an authorization grant", () => {
    expect(authLayout).toContain('classification.kind === "living-community"');
    expect(authLayout).toContain("getPublicLivingCommunityPresentation");
    expect(stage).toContain("community?.heroImageUrl");
    expect(login).toContain("Sign in to");
  });

  it("uses authenticated resident scope for community media on the Living home", () => {
    expect(home).toContain("getResidentLivingCommunityPresentations");
    expect(home).toContain("item.tenancyId === home.tenancyId");
    expect(home).toContain("community?.heroImageUrl");
    expect(home).toContain("<LivingCommunityGallery");
  });

  it("keeps the anonymous RPC limited to public-safe presentation fields", () => {
    const publicFunction = migration.slice(
      migration.indexOf("create or replace function public.get_public_living_community_profile"),
      migration.indexOf("create or replace function public.get_resident_living_community_profiles"),
    );
    expect(publicFunction).not.toContain("'organizationId'");
    expect(publicFunction).not.toContain("'propertyId'");
    expect(publicFunction).not.toContain("tenancyId");
    expect(publicFunction).not.toContain("household");
    expect(publicFunction).not.toContain("balance");
  });

  it("does not fabricate arbitrary community profiles", () => {
    expect(communityData).toContain('normalizedSubdomain === MAPLE_COURT_DEMO_PRESENTATION.subdomain');
    expect(communityData).not.toContain("propertyName ===");
  });

  it("keeps resident community media same-origin", () => {
    expect(migration).toContain("hero_image_url like '/media/%'");
    expect(migration).not.toContain("hero_image_url ~ '^https://'");
    expect(communityData).toContain('url?.startsWith("/media/")');
  });
});
