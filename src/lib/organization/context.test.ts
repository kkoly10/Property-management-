import { describe, expect, it } from "vitest";
import { decideOrganizationContext, normalizeOperatorOrganizations, type OperatorOrganization } from "./context";

const orgA: OperatorOrganization = { organizationId: "a", displayName: "Atlas", slug: "atlas", roleCode: "org_owner" };
const orgB: OperatorOrganization = { organizationId: "b", displayName: "Beacon", slug: "beacon", roleCode: "property_manager" };

describe("decideOrganizationContext", () => {
  it("sends an operator with no membership to onboarding rather than an empty workspace", () => {
    expect(decideOrganizationContext([], null)).toEqual({ state: "none", organizations: [], active: null });
    expect(decideOrganizationContext([], "a")).toEqual({ state: "none", organizations: [], active: null });
  });

  it("chooses automatically ONLY when there is nothing to choose between", () => {
    expect(decideOrganizationContext([orgA], null)).toEqual({ state: "active", organizations: [orgA], active: orgA });
    expect(decideOrganizationContext([orgA, orgB], null).state).toBe("unselected");
  });

  it("honors a stored selection", () => {
    expect(decideOrganizationContext([orgA, orgB], "b")).toEqual({ state: "active", organizations: [orgA, orgB], active: orgB });
  });

  it("never falls back to another organization when the selection disappears", () => {
    // The decisive rule. An operator whose access to Beacon was revoked must NOT silently start
    // looking at Atlas's residents, payments and documents.
    const result = decideOrganizationContext([orgA], "b");
    expect(result.state).toBe("revoked");
    expect(result.active).toBeNull();
  });

  it("treats a tampered or stale cookie the same as a lost membership — never as a free choice", () => {
    expect(decideOrganizationContext([orgA, orgB], "c").state).toBe("revoked");
    // Even with a single organization available, an unknown selection is reported rather than replaced.
    expect(decideOrganizationContext([orgA], "not-a-real-id").state).toBe("revoked");
  });
});

describe("normalizeOperatorOrganizations", () => {
  it("reads the RPC payload and drops anything without an id", () => {
    expect(normalizeOperatorOrganizations({
      organizations: [
        { organizationId: "a", displayName: "Atlas", slug: "atlas", roleCode: "org_owner" },
        { displayName: "No id" },
        { organizationId: "b" },
      ],
    })).toEqual([
      { organizationId: "a", displayName: "Atlas", slug: "atlas", roleCode: "org_owner" },
      { organizationId: "b", displayName: "Untitled organization", slug: "", roleCode: "" },
    ]);
  });

  it("returns nothing for a malformed payload instead of inventing an organization", () => {
    expect(normalizeOperatorOrganizations(null)).toEqual([]);
    expect(normalizeOperatorOrganizations({})).toEqual([]);
    expect(normalizeOperatorOrganizations({ organizations: "nope" })).toEqual([]);
  });
});
