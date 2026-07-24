import { describe, expect, it } from "vitest";
import { cancelAnnouncementSchema, createAnnouncementSchema, publishAnnouncementSchema } from "@/lib/validation/announcements";

const propertyId = "10000000-0000-4000-8000-000000000001";
const organizationId = "20000000-0000-4000-8000-000000000002";

describe("announcement validation", () => {
  it("trims a property announcement", () => {
    expect(createAnnouncementSchema.parse({
      organizationId,
      propertyId,
      title: "  Water notice  ",
      bodyText: "  Water will be paused Tuesday.  ",
      locale: "en-US",
      audienceType: "property_residents",
    })).toMatchObject({ title: "Water notice", bodyText: "Water will be paused Tuesday." });
  });

  it("requires audience-compatible property context", () => {
    expect(createAnnouncementSchema.safeParse({
      organizationId, propertyId, title: "Notice", bodyText: "Details", locale: "en-US", audienceType: "organization_residents",
    }).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({
      organizationId, propertyId: null, title: "Notice", bodyText: "Details", locale: "en-US", audienceType: "owners",
    }).success).toBe(false);
  });

  it("validates publish and cancel versions", () => {
    expect(publishAnnouncementSchema.safeParse({ expectedVersion: 1, selectedTenancyIds: [propertyId] }).success).toBe(true);
    expect(cancelAnnouncementSchema.safeParse({ expectedVersion: 0 }).success).toBe(false);
  });
});
