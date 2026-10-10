import { describe, expect, it } from "vitest";
import {
  closeRentalInquirySchema,
  submitRentalInquirySchema,
  verifyRentalInquirySchema,
} from "./rental-inquiry";

const publicId = "81000000-0000-4000-8000-000000000081";

describe("rental inquiry validation", () => {
  it("accepts only bounded contact-and-question intake", () => {
    const result = submitRentalInquirySchema.safeParse({
      publicId,
      firstName: " Jamie ",
      lastName: " Renter ",
      email: "jamie@example.com",
      question: "Is water included in the monthly rent?",
      locale: "en-US",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.firstName).toBe("Jamie");
  });

  it("rejects malformed verification and close commands", () => {
    expect(verifyRentalInquirySchema.safeParse({ token: "short" }).success).toBe(false);
    expect(closeRentalInquirySchema.safeParse({
      organizationId: publicId,
      inquiryId: publicId,
      expectedVersion: 0,
    }).success).toBe(false);
  });
});
