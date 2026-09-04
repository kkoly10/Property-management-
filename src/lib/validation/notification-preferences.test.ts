import { describe, expect, it } from "vitest";
import { notificationCategories, updateNotificationPreferencesSchema } from "@/lib/validation/notification-preferences";
import { isAccessMail } from "@/lib/notifications/sender";

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

describe("the suppressible category set", () => {
  // Every preference surface (resident, operator, owner) builds its toggle matrix from
  // `notificationCategories`, so this list IS what a user can silence. It must stay exactly the five
  // non-NULL values of private.notification_template_category — no more, or access mail becomes
  // suppressible; no fewer, or a category of mail has no off switch.
  it("is exactly the five categories the database maps templates to", () => {
    expect([...notificationCategories]).toEqual(["payments", "maintenance", "messages", "documents", "announcements"]);
  });

  it("has a representative template for each, and none of them is access mail", () => {
    // The prefixes mirror the SQL CASE arms: payment%/receipt%, maintenance%/work_order%,
    // conversation%/message%, document%/statement%, announcement%. If isAccessMail drifts away from
    // that function, a category shown in the UI stops matching the mail it claims to control.
    const representative: Record<string, string> = {
      payments: "payment_received",
      maintenance: "maintenance_updated",
      messages: "conversation_message_received",
      documents: "document_delivered",
      announcements: "announcement_published",
    };
    for (const category of notificationCategories) {
      expect(isAccessMail(representative[category]), `${category} counted as access mail`).toBe(false);
    }
  });

  it("treats an unmapped template as unsuppressible access mail", () => {
    // The SQL falls through to NULL, and the UI offers no toggle that could reach it. Both halves have
    // to agree, or an invitation becomes silenceable.
    for (const code of ["staff_invitation", "resident_invitation", "owner_invitation", "security_alert"]) {
      expect(isAccessMail(code), code).toBe(true);
    }
  });
});
