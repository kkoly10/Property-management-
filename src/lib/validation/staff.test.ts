import { describe, expect, it } from "vitest";
import {
  acceptStaffInvitationSchema,
  inviteStaffSchema,
  replaceStaffPropertyScopesSchema,
  revokeStaffMembershipSchema,
  updateStaffMembershipSchema,
} from "@/lib/validation/staff";

const organizationId = "10000000-0000-4000-8000-000000000001";
const propertyId = "20000000-0000-4000-8000-000000000002";

describe("staff access validation", () => {
  it("normalizes a bounded invitation", () => {
    expect(inviteStaffSchema.parse({
      organizationId,
      email: "  MANAGER@EXAMPLE.COM ",
      roleCode: "property_manager",
      propertyIds: [propertyId],
      startsAt: "2026-07-24T12:00:00.000Z",
      endsAt: null,
      mfaRequired: true,
      locale: "en-US",
      auditReason: "  Portfolio access  ",
    })).toMatchObject({ email: "manager@example.com", auditReason: "Portfolio access" });
  });

  it("rejects inverted dates and invalid statuses", () => {
    expect(inviteStaffSchema.safeParse({
      organizationId,
      email: "manager@example.com",
      roleCode: "leasing_agent",
      propertyIds: [propertyId],
      startsAt: "2026-07-25T12:00:00.000Z",
      endsAt: "2026-07-24T12:00:00.000Z",
      mfaRequired: false,
      locale: "en-US",
      auditReason: null,
    }).success).toBe(false);
    expect(updateStaffMembershipSchema.safeParse({
      roleCode: "leasing_agent",
      status: "revoked",
      startsAt: null,
      endsAt: null,
      mfaRequired: false,
      expectedVersion: 1,
      auditReason: null,
    }).success).toBe(false);
  });

  it("requires reasons for scope replacement and revocation", () => {
    expect(replaceStaffPropertyScopesSchema.safeParse({
      propertyIds: [], expectedVersion: 1, auditReason: "",
    }).success).toBe(false);
    expect(revokeStaffMembershipSchema.safeParse({
      expectedVersion: 1, auditReason: "Access ended",
    }).success).toBe(true);
  });

  it("accepts only a base64url invitation token", () => {
    expect(acceptStaffInvitationSchema.safeParse({ token: "a".repeat(43) }).success).toBe(true);
    expect(acceptStaffInvitationSchema.safeParse({ token: "not a token" }).success).toBe(false);
  });
});
