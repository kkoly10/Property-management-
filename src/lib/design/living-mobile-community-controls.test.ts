import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authLayout = readFileSync(resolve(__dirname, "../../app/(auth)/layout.tsx"), "utf8");
const login = readFileSync(resolve(__dirname, "../../app/(auth)/login/page.tsx"), "utf8");
const authStage = readFileSync(resolve(__dirname, "../../components/auth/auth-surface-stage.tsx"), "utf8");
const residentHome = readFileSync(resolve(__dirname, "../../app/home/page.tsx"), "utf8");
const gallery = readFileSync(resolve(__dirname, "../../components/living/living-community-gallery.tsx"), "utf8");
const propertyPage = readFileSync(resolve(__dirname, "../../app/app/properties/[propertyId]/page.tsx"), "utf8");
const form = readFileSync(resolve(__dirname, "../../app/app/properties/[propertyId]/living-community-form.tsx"), "utf8");
const api = readFileSync(resolve(__dirname, "../../app/api/v1/living-community-profile/route.ts"), "utf8");
const migration = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260905170000_phase_8_living_community_controls.sql"), "utf8");

describe("Crecy Living mobile login and operator controls", () => {
  it("does not vertically center the mobile auth form below a large blank viewport", () => {
    expect(authLayout).toContain("items-start");
    expect(authLayout).toContain("lg:items-center");
    expect(authLayout).not.toContain('className="flex min-h-screen items-center justify-center');
  });

  it("renders community identity and hero media directly on mobile login", () => {
    expect(login).toContain("<LivingCommunityIdentity");
    expect(login).toContain("community.heroImageUrl");
    expect(login).toContain("lg:hidden");
    expect(login).toContain('"Crecy Living · Demo"');
  });

  it("loads same-origin community media without the Next optimizer on Living surfaces", () => {
    expect(login).toContain("unoptimized");
    expect(authStage).toContain("unoptimized");
    expect(residentHome).toContain("unoptimized");
    expect(gallery).toContain("unoptimized");
    expect(form).toContain("unoptimized");
  });

  it("adds the resident portal workspace to the operator property page", () => {
    expect(propertyPage).toContain('["Resident portal", "#resident-portal"]');
    expect(propertyPage).toContain("<LivingCommunityForm");
    expect(propertyPage).toContain("getOperatorLivingCommunityProfile");
  });

  it("keeps media assignment separate from arbitrary third-party URLs", () => {
    expect(form).not.toContain('type="url"');
    expect(form).not.toContain("heroImageUrl:");
    expect(form).toContain("Crecy-managed storage");
  });

  it("uses an authenticated, permission-checked, versioned command boundary", () => {
    expect(api).toContain("save_living_community_profile");
    expect(api).toContain("expectedVersion");
    expect(migration).toContain("private.has_property_access(p_property_id,'property.manage')");
    expect(migration).toContain("VERSION_CONFLICT");
    expect(migration).toContain("SaveLivingCommunityProfile");
    expect(migration).toContain("living.community_profile.saved");
  });

  it("preserves media columns when public metadata is saved", () => {
    const updateSection = migration.slice(
      migration.indexOf("update public.living_community_profiles"),
      migration.indexOf("returning * into v_profile;", migration.indexOf("update public.living_community_profiles")),
    );
    expect(updateSection).not.toContain("hero_image_url=");
    expect(updateSection).not.toContain("lobby_image_url=");
    expect(updateSection).not.toContain("courtyard_image_url=");
    expect(updateSection).not.toContain("model_home_image_url=");
  });
});
