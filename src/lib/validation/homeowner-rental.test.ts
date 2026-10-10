import { describe, expect, it } from "vitest";
import { homeownerRentalSchema } from "./homeowner-rental";
import { rentalFixture } from "./homeowner-rental.fixture";
import { decideOrganizationContext, normalizeOperatorOrganizations } from "@/lib/organization/context";
import { navigationFor } from "@/components/app/primary-navigation";

describe("homeowner rental boundary", () => {
  it("accepts a basement or another space inside an explicitly selected property", () => {
    expect(homeownerRentalSchema.safeParse(rentalFixture).success).toBe(true);
    expect(homeownerRentalSchema.safeParse({ ...rentalFixture, property: { kind: "existing", propertyId: rentalFixture.organizationId } }).success).toBe(true);
  });
  it("requires an explicit property mode and rejects public-publishing or financial fields", () => {
    expect(homeownerRentalSchema.safeParse({ ...rentalFixture, property: {} }).success).toBe(false);
    expect(homeownerRentalSchema.safeParse({ ...rentalFixture, publish: true }).success).toBe(false);
    expect(homeownerRentalSchema.safeParse({ ...rentalFixture, space: { ...rentalFixture.space, rent: 123 } }).success).toBe(false);
  });
  it("checks new-operator identity, valid time zone, note bounds and room counts", () => {
    for (const patch of [{ legalName: "" }, { timeZone: "Not/A_Zone" }, { name: "" }]) {
      expect(homeownerRentalSchema.safeParse({ ...rentalFixture, property: { ...rentalFixture.property, ...patch } }).success).toBe(false);
    }
    for (const patch of [{ bedrooms: 1.7 }, { bathrooms: -1 }, { entrance: "public" }, { parkingNotes: "x".repeat(501) }]) {
      expect(homeownerRentalSchema.safeParse({ ...rentalFixture, space: { ...rentalFixture.space, ...patch } }).success).toBe(false);
    }
  });
  it("keeps presentation per organization, with a professional legacy fallback", () => {
    const organizations = normalizeOperatorOrganizations({ organizations: [null, [], { organizationId: "a", customerPath: "self_managing" }, { organizationId: "b", customerPath: "property_manager" }, { organizationId: "c" }] });
    expect(organizations).toHaveLength(3);
    expect(decideOrganizationContext(organizations, "a").active?.customerPath).toBe("self_managing");
    expect(decideOrganizationContext(organizations, "b").active?.customerPath).toBe("property_manager");
    expect(organizations[2].customerPath).toBe("property_manager");
    expect(decideOrganizationContext(organizations, "revoked").active).toBeNull();
  });
  it("offers simpler self-manager navigation without rewriting professional destinations", () => {
    const self = navigationFor("self_managing");
    const professional = navigationFor("property_manager");
    expect(self.overview.label).toBe("Home");
    expect(self.groups.flatMap((group) => group.items).map((item) => item.href)).toContain("/app/rentals");
    expect(self.groups.flatMap((group) => group.items).map((item) => item.href)).not.toContain("/app/owner-statements");
    expect(professional.groups.flatMap((group) => group.items).map((item) => item.href)).toContain("/app/owner-statements");
  });
});
