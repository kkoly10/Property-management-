import { describe, expect, it } from "vitest";
import { normalizePhoneE164 } from "@/lib/phone";

describe("normalizePhoneE164", () => {
  it("adds +1 for ordinary 10-digit US/Canada input", () => {
    expect(normalizePhoneE164("5407965500")).toBe("+15407965500");
    expect(normalizePhoneE164("(540) 796-5500")).toBe("+15407965500");
  });

  it("keeps already-normalized NANP numbers", () => {
    expect(normalizePhoneE164("+15407965500")).toBe("+15407965500");
    expect(normalizePhoneE164("1 540 796 5500")).toBe("+15407965500");
  });

  it("accepts explicit international E.164 and refuses ambiguous international digits", () => {
    expect(normalizePhoneE164("+442071838750")).toBe("+442071838750");
    expect(normalizePhoneE164("442071838750")).toBeNull();
  });

  it("allows an empty optional phone", () => {
    expect(normalizePhoneE164("")).toBe("");
    expect(normalizePhoneE164("   ")).toBe("");
  });
});
