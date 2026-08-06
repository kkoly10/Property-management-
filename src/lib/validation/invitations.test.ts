import { describe, expect, it } from "vitest";
import { acceptRelationshipInvitationSchema, inviteRelationshipSchema } from "./invitations";

const validResident = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  relationshipType: "resident_person" as const,
  relationshipId: "20000000-0000-4000-8000-000000000002",
  email: "Resident@Example.com",
  locale: "en-US" as const,
  redirectSurface: "crecy_living" as const,
};

describe("relationship invitation validation", () => {
  it("accepts a resident invitation and normalizes the email", () => {
    const parsed = inviteRelationshipSchema.parse(validResident);
    expect(parsed.email).toBe("resident@example.com");
    expect(parsed.redirectSurface).toBe("crecy_living");
  });

  it("accepts an owner invitation to the owner portal", () => {
    expect(inviteRelationshipSchema.safeParse({ ...validResident, relationshipType: "owner_entity", redirectSurface: "crecy_owner" }).success).toBe(true);
  });

  it("rejects a portal that does not match the relationship type", () => {
    expect(inviteRelationshipSchema.safeParse({ ...validResident, redirectSurface: "crecy_owner" }).success).toBe(false);
    expect(inviteRelationshipSchema.safeParse({ ...validResident, relationshipType: "owner_entity", redirectSurface: "crecy_living" }).success).toBe(false);
  });

  it("rejects a malformed email and unknown locale", () => {
    expect(inviteRelationshipSchema.safeParse({ ...validResident, email: "not-an-email" }).success).toBe(false);
    expect(inviteRelationshipSchema.safeParse({ ...validResident, locale: "de-DE" }).success).toBe(false);
  });
});

describe("relationship invitation acceptance validation", () => {
  it("accepts a token in the issued shape and rejects malformed tokens", () => {
    expect(acceptRelationshipInvitationSchema.safeParse({ token: "a".repeat(43) }).success).toBe(true);
    expect(acceptRelationshipInvitationSchema.safeParse({ token: "short" }).success).toBe(false);
    expect(acceptRelationshipInvitationSchema.safeParse({ token: "has spaces and symbols!" }).success).toBe(false);
  });
});
