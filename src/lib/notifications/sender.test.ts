import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEMPLATE_CODES } from "./templates";
import { TEMPLATE_AUDIENCE, audienceForRelationshipType, hasRecipientAudienceEntry, isAccessMail, senderFor, unsubscribeUrlFor } from "./sender";
import { NOTIFICATION_PREFERENCE_PATH } from "./preference-routes";
import { routeForHost } from "@/lib/runtime/host-routing";
import { requiresSession } from "@/lib/marketing/navigation";
import { originForAudience, type LinkAudience } from "@/lib/runtime/host";

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

describe("document_delivered, the one template with more than one audience", () => {
  it("maps a relationship type to the recipient's brand", () => {
    expect(audienceForRelationshipType("resident_person")).toBe("resident");
    expect(audienceForRelationshipType("owner_entity")).toBe("owner");
    // Crecy Vendor is reserved with nothing behind it, so it must not appear as a From brand.
    expect(audienceForRelationshipType("vendor_contact")).toBe("operator");
    expect(audienceForRelationshipType(null)).toBeNull();
    expect(audienceForRelationshipType("something_else")).toBeNull();
  });

  it("sends from the recipient's brand when the audience is resolved", () => {
    expect(senderFor("document_delivered", "resident").from).toMatch(/^Crecy Living <.*@mail\.crecyliving\.com>$/);
    expect(senderFor("document_delivered", "owner").from).toMatch(/^Crecy Owner <.*@mail\.crecyos\.com>$/);
  });

  it("falls back to the neutral identity when it cannot be resolved", () => {
    // Unresolvable must not dead-letter or guess: it degrades to what it did before.
    expect(senderFor("document_delivered", null).from).toMatch(/^Crecy </);
    expect(senderFor("document_delivered").from).toMatch(/^Crecy </);
  });

  it("stays unsubscribable whichever audience it resolves to", () => {
    for (const audience of ["resident", "owner", null] as const) {
      expect(senderFor("document_delivered", audience).unsubscribable).toBe(true);
    }
  });
});
describe("unsubscribe destinations", () => {
  const audiences: LinkAudience[] = ["operator", "resident", "owner"];

  it("points every audience at a path its own origin actually serves", () => {
    // This is the "workspace URL" guard. The onboarding form once advertised app.crecy.com/{slug} as a
    // workspace URL that had never resolved, because nothing checked. A List-Unsubscribe header is the
    // same shape of promise made to someone outside the app, so the path is checked against the real
    // router rather than assumed: routeForHost must agree to SERVE it on that audience's own host, not
    // redirect it somewhere else and not reject it.
    for (const audience of audiences) {
      const origin = originForAudience(audience);
      const host = new URL(origin).host;
      const path = NOTIFICATION_PREFERENCE_PATH[audience];
      expect(routeForHost(host, path), `${audience} ${host}${path}`).toEqual({ type: "continue" });
    }
  });

  it("requires a session for every preference path", () => {
    // These are per-user preferences. A preference page reachable without a session would either leak
    // one user's choices or silently edit nobody's.
    for (const audience of audiences) {
      expect(requiresSession(NOTIFICATION_PREFERENCE_PATH[audience]), audience).toBe(true);
    }
  });

  it("gives category mail the unsubscribe URL of the recipient's own brand", () => {
    // The unsubscribe origin matches the From domain and the body's links. Sending owner mail from
    // crecyos.com but unsubscribing at crecyliving.com is the cross-brand mismatch the audience split
    // exists to prevent.
    expect(unsubscribeUrlFor("announcement_published")).toBe("https://crecyliving.com/more/preferences");
    expect(unsubscribeUrlFor("conversation_message_received")).toBe("https://crecyliving.com/more/preferences");
  });

  it("offers no unsubscribe URL when the recipient's surface is ambiguous", () => {
    // document_delivered is TEMPLATE_AUDIENCE "operator" only as a neutral FROM identity. Its recipient
    // is resolved through user_relationships (resident_person | owner_entity), so it never reaches an
    // operator, and an app.crecyos.com unsubscribe link would send a resident to a console they have no
    // account on. Omitting the header is the honest answer until the job carries the relationship type.
    expect(unsubscribeUrlFor("document_delivered")).toBeNull();
    expect(senderFor("document_delivered").unsubscribable).toBe(true);
  });

  it("classifies the recipient surface of every template that exists", () => {
    // Mirrors the TEMPLATE_AUDIENCE coverage test. Without this a new template falls through to null and
    // silently loses its unsubscribe header, which is a quiet compliance regression rather than a crash.
    for (const code of TEMPLATE_CODES) {
      expect(hasRecipientAudienceEntry(code), `${code} has no recipient audience`).toBe(true);
    }
  });

  it("offers no unsubscribe URL for access mail", () => {
    // The null lives in unsubscribeUrlFor so a caller cannot attach a link to access mail by forgetting
    // to consult `unsubscribable` first.
    for (const code of ["staff_invitation", "resident_invitation", "owner_invitation"]) {
      expect(unsubscribeUrlFor(code), code).toBeNull();
    }
  });

  it("collapses onto the one app origin in local development", () => {
    // Dev keeps every audience on a single origin, so the URL stays absolute and clickable rather than
    // emitting a production crecyliving.com link into a local inbox.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(unsubscribeUrlFor("announcement_published")).toBe("http://localhost:3000/more/preferences");
    expect(unsubscribeUrlFor("conversation_message_received")).toBe("http://localhost:3000/more/preferences");
  });

  it("emits nothing rather than a relative path when no origin is configured", () => {
    // A bare "/more/preferences" in a mail header is a dead link in every client that reads it.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(unsubscribeUrlFor("announcement_published")).toBeNull();
  });
});
