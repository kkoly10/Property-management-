import { describe, expect, it } from "vitest";
import { sendConversationMessageSchema } from "@/lib/validation/messaging";

describe("sendConversationMessageSchema", () => {
  it("trims a valid message", () => {
    expect(sendConversationMessageSchema.parse({ bodyText: "  Hello management.  " })).toEqual({
      bodyText: "Hello management.",
    });
  });

  it("rejects blank and oversized messages", () => {
    expect(sendConversationMessageSchema.safeParse({ bodyText: "   " }).success).toBe(false);
    expect(sendConversationMessageSchema.safeParse({ bodyText: "x".repeat(10_001) }).success).toBe(false);
  });
});

