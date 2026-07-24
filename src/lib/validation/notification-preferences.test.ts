import { describe, expect, it } from "vitest";
import { updateNotificationPreferencesSchema } from "@/lib/validation/notification-preferences";

const validInput = {
  locale: "en-US",
  reduceMotion: false,
  highContrast: false,
  textScale: "standard",
  channels: {
    email: { payments: true, maintenance: true, messages: true, documents: true, announcements: true },
    sms: { payments: false, maintenance: false, messages: false, documents: false, announcements: false },
    whatsapp: { payments: false, maintenance: false, messages: false, documents: false, announcements: false },
    push: { payments: false, maintenance: false, messages: false, documents: false, announcements: false },
  },
  expectedVersion: 1,
} as const;

describe("notification preference validation", () => {
  it("accepts the complete channel and category matrix", () => {
    expect(updateNotificationPreferencesSchema.safeParse(validInput).success).toBe(true);
  });

  it("accepts supported locale and accessibility choices", () => {
    const result = updateNotificationPreferencesSchema.safeParse({
      ...validInput,
      locale: "fr-CA",
      reduceMotion: true,
      highContrast: true,
      textScale: "large",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing categories, unknown keys, and stale-shaped versions", () => {
    const missingCategory = structuredClone(validInput) as Record<string, unknown>;
    const channels = missingCategory.channels as Record<string, Record<string, boolean>>;
    delete channels.email.payments;
    expect(updateNotificationPreferencesSchema.safeParse(missingCategory).success).toBe(false);
    expect(updateNotificationPreferencesSchema.safeParse({ ...validInput, marketingEmail: true }).success).toBe(false);
    expect(updateNotificationPreferencesSchema.safeParse({ ...validInput, expectedVersion: 0 }).success).toBe(false);
  });
});

