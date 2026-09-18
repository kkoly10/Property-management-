import { describe, expect, it } from "vitest";
import { livingCommunityProfileSchema } from "@/lib/validation/living-community";

const base = {
  propertyId: "207a14f8-28e5-4fa8-86c8-14471b7363e5",
  subdomain: "societys-court",
  displayName: "Society’s Court",
  publicAddressText: "500 Lakewood Drive",
  headline: "Welcome home.",
  leasingEmail: "",
  leasingPhoneE164: "",
  officeHours: [],
  amenities: [],
  publicNoticeTitle: "",
  publicNoticeBody: "",
  status: "draft" as const,
  expectedVersion: 0,
};

describe("livingCommunityProfileSchema phone input", () => {
  it("normalizes a 10-digit operator entry before the RPC", () => {
    const result = livingCommunityProfileSchema.parse({ ...base, leasingPhoneE164: "5407965500" });
    expect(result.leasingPhoneE164).toBe("+15407965500");
  });

  it("rejects a phone that cannot be normalized safely", () => {
    const result = livingCommunityProfileSchema.safeParse({ ...base, leasingPhoneE164: "12345" });
    expect(result.success).toBe(false);
  });
});
