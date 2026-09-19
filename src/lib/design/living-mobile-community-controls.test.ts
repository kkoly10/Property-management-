import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authLayout = readFileSync(resolve(__dirname, "../../app/(auth)/layout.tsx"), "utf8");
const login = readFileSync(resolve(__dirname, "../../app/(auth)/login/page.tsx"), "utf8");
const propertyPage = readFileSync(resolve(__dirname, "../../app/app/properties/[propertyId]/page.tsx"), "utf8");
const form = readFileSync(resolve(__dirname, "../../app/app/properties/[propertyId]/living-community-form.tsx"), "utf8");
const api = readFileSync(resolve(__dirname, "../../app/api/v1/living-community-profile/route.ts"), "utf8");
const migration = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260905170000_phase_8_living_community_controls.sql"), "utf8");
const saveRepair = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260918221500_fix_living_community_save_citext.sql"), "utf8");
const appShell = readFileSync(resolve(__dirname, "../../components/app/app-shell.tsx"), "utf8");
const mobileNavigation = readFileSync(resolve(__dirname, "../../components/app/mobile-navigation.tsx"), "utf8");
const input = readFileSync(resolve(__dirname, "../../components/ui/input.tsx"), "utf8");
const textarea = readFileSync(resolve(__dirname, "../../components/ui/textarea.tsx"), "utf8");
const nativeSelect = readFileSync(resolve(__dirname, "../../components/ui/native-select.tsx"), "utf8");

describe("Crecy Living mobile login and operator controls", () => {
  it("does not vertically center the mobile auth form below a large blank viewport", () => {
    expect(authLayout).toContain("items-start");
    expect(authLayout).toContain("lg:items-center");
    expect(authLayout).not.toContain('className="flex min-h-screen items-center justify-center');
  });

  it("renders community identity and hero media directly on mobile login", () => {
    expect(login).toContain("<LivingCommunityIdentity");
    expect(login).toContain("community.heroImageUrl");
    expect(login).toContain("unoptimized");
    expect(login).toContain("lg:hidden");
    expect(login).toContain('"Crecy Living · Demo"');
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

  it("schema-qualifies citext inside the empty-search-path save RPC", () => {
    expect(saveRepair).toContain("set search_path = ''");
    expect(saveRepair).toContain("::public.citext");
    expect(saveRepair).not.toMatch(/::citext\b/);
  });

  it("keeps phone controls usable on iPhone and normalizes before submission", () => {
    expect(form).toContain('type="tel"');
    expect(form).toContain('inputMode="tel"');
    expect(form).toContain("normalizePhoneE164");
    for (const control of [input, textarea, nativeSelect]) {
      expect(control).toContain("text-base sm:text-sm");
    }
  });

  it("gives the mobile operator header a full-width search field and no second row", () => {
    // This used to assert `flex-col items-stretch` + `sm:flex-row`: the header stacked the wordmark
    // above the search field because a third row — the thirteen-section scrolling rail — sat beneath
    // them both, and the search field had nowhere else to go. Measured, that stack came to 156px on
    // a 390px phone.
    //
    // The rail is gone (see mobile-navigation.tsx) and the header is a single 73px row, so the
    // stacking it required would now be dead weight. The protection this test exists for — the
    // search field spans the row on a phone, and the content column can still shrink below its
    // content — is asserted here directly, and the real geometry is asserted at a real viewport in
    // e2e/mobile.spec.ts.
    expect(appShell).toContain('<div className="min-w-0 flex-1">');
    expect(appShell).toContain("min-w-0 max-w-full");
    expect(appShell).not.toContain("PrimaryNavigation compact");
  });

  it("reaches every operator destination from a phone", () => {
    // Settings, Team access, Notifications, Privacy requests, Help and the organization switcher
    // lived only inside the `lg:flex` sidebar, so on a phone they could not be reached at any number
    // of taps. Each one has to survive in the phone sheet.
    for (const destination of ["/settings/payments", "/settings/team", "/settings/notifications?returnTo=/app", "/settings/privacy?returnTo=/app", "/security"]) {
      expect(mobileNavigation, `${destination} is unreachable on a phone`).toContain(destination);
    }
    expect(appShell).toContain('variant="sheet"');
    // The bar replaces the sidebar only where the sidebar is absent.
    expect(mobileNavigation).toContain("lg:hidden");
    // A fixed bar prints as a black stripe across the bottom of an owner statement otherwise.
    expect(mobileNavigation).toContain("print:hidden");
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


describe("Living community image delivery", () => {
  const authStage = readFileSync(resolve(__dirname, "../../components/auth/auth-surface-stage.tsx"), "utf8");
  const home = readFileSync(resolve(__dirname, "../../app/home/page.tsx"), "utf8");
  const gallery = readFileSync(resolve(__dirname, "../../components/living/living-community-gallery.tsx"), "utf8");

  it("bypasses the Next image optimizer for same-origin community media", () => {
    expect(authStage).toContain("unoptimized");
    expect(home).toContain("unoptimized");
    expect(gallery).toContain("unoptimized");
    expect(form).toContain("unoptimized");
  });
});
