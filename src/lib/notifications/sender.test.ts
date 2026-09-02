import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEMPLATE_CODES } from "./templates";
import { TEMPLATE_AUDIENCE, isAccessMail, senderFor } from "./sender";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_MARKETING_ORIGIN", "https://crecyos.com");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.crecyos.com");
  vi.stubEnv("NEXT_PUBLIC_LIVING_ROOT_DOMAIN", "crecyliving.com");
  vi.stubEnv("CRECY_MAIL_FROM_OPERATOR", "");
  vi.stubEnv("CRECY_MAIL_FROM_RESIDENT", "");
  vi.stubEnv("CRECY_MAIL_FROM_OWNER", "");
});

describe("transactional sender identity", () => {
  it("assigns an audience to every template that exists", () => {
    // The map is what decides both the From domain and whether a message is unsubscribable, so a new
    // template silently defaulting to the operator identity would mail residents from the wrong brand.
    for (const code of TEMPLATE_CODES) {
      expect(TEMPLATE_AUDIENCE[code], `${code} has no audience`).toBeDefined();
    }
  });

  it("sends from the domain the body's links point at", () => {
    // From-domain / link-domain mismatch is a phishing signal to filters and to recipients alike.
    expect(senderFor("resident_invitation").from).toContain("@mail.crecyliving.com");
    expect(senderFor("announcement_published").from).toContain("@mail.crecyliving.com");
    expect(senderFor("staff_invitation").from).toContain("@mail.crecyos.com");
    expect(senderFor("owner_invitation").from).toContain("@mail.crecyos.com");
  });

  it("names the right brand per audience", () => {
    expect(senderFor("resident_invitation").from).toMatch(/^Crecy Living </);
    expect(senderFor("owner_invitation").from).toMatch(/^Crecy Owner </);
    expect(senderFor("staff_invitation").from).toMatch(/^Crecy </);
  });

  it("never makes an invitation unsubscribable", () => {
    // Access mail maps to a NULL category in private.notification_template_category precisely so it
    // cannot be silenced. A List-Unsubscribe header would let someone opt out of the message that
    // grants them access, and then be unable to accept an invitation.
    for (const code of ["staff_invitation", "resident_invitation", "owner_invitation"]) {
      expect(isAccessMail(code), `${code} is not access mail`).toBe(true);
      expect(senderFor(code).unsubscribable, `${code} is unsubscribable`).toBe(false);
    }
  });

  it("makes category mail unsubscribable", () => {
    for (const code of ["announcement_published", "conversation_message_received", "document_delivered"]) {
      expect(isAccessMail(code), `${code} counted as access mail`).toBe(false);
      expect(senderFor(code).unsubscribable, `${code} is not unsubscribable`).toBe(true);
    }
  });

  it("honors an explicit From override", () => {
    vi.stubEnv("CRECY_MAIL_FROM_RESIDENT", "Crecy Living <hello@mail.crecyliving.com>");
    expect(senderFor("resident_invitation").from).toBe("Crecy Living <hello@mail.crecyliving.com>");
  });

  it("replies to the audience's own domain", () => {
    expect(senderFor("resident_invitation").replyTo).toBe("support@crecyliving.com");
    expect(senderFor("owner_invitation").replyTo).toBe("support@crecyos.com");
  });
});
