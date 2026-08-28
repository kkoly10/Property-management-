import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GROWTH_TRIAL_DAYS, growthTrialLabel } from "./trial";

describe("the Growth trial length", () => {
  it("is the 30 days file 11 specifies", () => {
    // File 11: "A 30-day no-card Growth trial is offered." This shipped at 14 in both the command and
    // the onboarding badge, so every workspace ever created got half the advertised trial.
    const spec = readFileSync(resolve(__dirname, "../../../docs/crecy-v4/11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC.md"), "utf8");
    expect(spec).toMatch(/30-day no-card Growth trial/i);
    expect(GROWTH_TRIAL_DAYS).toBe(30);
    expect(growthTrialLabel).toBe("30 days");
  });

  it("agrees with the length the database actually provisions", () => {
    // The decisive assertion. The application's copy and the database's provisioning are two separate
    // authorities, and the defect was precisely that they agreed with each other on the WRONG number
    // while disagreeing with the pricing spec. This pins them to each other.
    const migration = readFileSync(
      resolve(__dirname, "../../../supabase/migrations/20260829100000_phase_1_organization_creation_boundary.sql"),
      "utf8",
    );
    const declared = /create or replace function private\.growth_trial_length\(\)[\s\S]*?select interval '(\d+) days'/.exec(migration);
    expect(declared, "private.growth_trial_length() is not declared as a plain day interval").not.toBeNull();
    expect(Number(declared![1])).toBe(GROWTH_TRIAL_DAYS);
  });

  it("is not advertised as a hardcoded number anywhere in the onboarding surface", () => {
    // Copy that hardcodes the number is how the two drifted in the first place.
    const page = readFileSync(resolve(__dirname, "../../app/onboarding/organization/page.tsx"), "utf8");
    expect(page).not.toMatch(/14 days/);
    expect(page).toContain("growthTrialLabel");
  });
});
