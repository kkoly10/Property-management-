import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const SECRET = "relay-secret-that-is-long-enough";
let sent: { url: string; init: RequestInit }[] = [];

function resendReplies(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }));
}

function message(overrides: Record<string, unknown> = {}) {
  return new Request("https://app.crecyos.com/api/internal/notifications/relay", {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({
      notificationJobId: "job-1", channel: "email", to: "r@example.com", locale: "en-US",
      templateCode: "resident_invitation", subject: "You are invited", body: "Accept it.", ...overrides,
    }),
  });
}

function payload() {
  return JSON.parse(String(sent[0].init.body));
}

beforeEach(() => {
  sent = [];
  vi.stubEnv("CRECY_NOTIFICATION_RELAY_SECRET", SECRET);
  vi.stubEnv("RESEND_API_KEY", "re_test_key_value");
  vi.stubEnv("NEXT_PUBLIC_MARKETING_ORIGIN", "https://crecyos.com");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.crecyos.com");
  vi.stubEnv("NEXT_PUBLIC_LIVING_ROOT_DOMAIN", "crecyliving.com");
  resendReplies(200, { id: "resend-123" });
});
afterEach(() => vi.unstubAllGlobals());

describe("the Resend relay", () => {
  it("sends and returns the provider message id", async () => {
    const response = await POST(message());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ messageId: "resend-123" });
    expect(payload().from).toContain("@mail.crecyliving.com");
    expect(payload().text).toBe("Accept it.");
  });

  it("sends a branded HTML part alongside the plain text, not instead of it", async () => {
    // The message was previously text-only, which reached recipients as unstyled prose with a bare URL.
    await POST(message());
    const sent = payload();
    expect(sent.text).toBe("Accept it.");
    expect(sent.html).toContain("<!doctype html>");
    expect(sent.html).toContain("Crecy Living");
    expect(sent.html).toContain("You are invited");
  });

  it("passes the job id as the provider idempotency key", async () => {
    // The worker retries on its own backoff; without this a retry is a second real email.
    await POST(message());
    expect((sent[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBe("job-1");
  });

  it("refuses a wrong credential, retryably", async () => {
    const bad = new Request("https://app.crecyos.com/api/internal/notifications/relay", {
      method: "POST", headers: { authorization: "Bearer wrong-secret-but-long-enough" }, body: "{}",
    });
    expect((await POST(bad)).status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("refuses a credential passed in the URL", async () => {
    const leaky = new Request("https://app.crecyos.com/api/internal/notifications/relay?secret=leaked", {
      method: "POST", headers: { authorization: `Bearer ${SECRET}` }, body: "{}",
    });
    expect((await POST(leaky)).status).toBe(400);
  });

  it("reports an unconfigured provider as retryable, not as a dead letter", async () => {
    // 503 matters: a non-retryable verdict dead-letters the job, and there is no command to revive a
    // dead letter. An unset API key must not destroy the queue while it is being configured.
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await POST(message())).status).toBe(503);
  });

  it("dead-letters a message the provider rejects, but retries provider outages", async () => {
    resendReplies(422, { message: "invalid to address" });
    expect((await POST(message())).status).toBe(422);
    resendReplies(500, { message: "upstream" });
    expect((await POST(message())).status).toBe(502);
    resendReplies(429, { message: "slow down" });
    expect((await POST(message())).status).toBe(502);
  });

  it("retries an invalid or unverified provider configuration instead of dead-lettering it", async () => {
    // A wrong API key and an unverified sending domain are OUR configuration, fixable without touching
    // the message. Dead-lettering the queue over them would mean a fix arrives to find nothing left to
    // send. Resend surfaces these as 401/403 and, confusingly, as a 400/422 validation_error whose body
    // names the key or the domain — all must be retryable (502), unlike a genuinely bad message.
    resendReplies(401, { message: "API key is invalid", name: "validation_error" });
    expect((await POST(message())).status).toBe(502);
    resendReplies(403, { message: "The mail.crecyliving.com domain is not verified." });
    expect((await POST(message())).status).toBe(502);
    resendReplies(400, { message: "API key is invalid", name: "validation_error" });
    expect((await POST(message())).status).toBe(502);
    resendReplies(422, { message: "The domain is not verified. Please verify a domain." });
    expect((await POST(message())).status).toBe(502);
    // But a genuinely bad recipient is still a dead letter — retrying an identical send cannot fix it.
    resendReplies(422, { message: "invalid `to` field" });
    expect((await POST(message())).status).toBe(422);
  });

  it("rejects a malformed message without calling the provider", async () => {
    expect((await POST(message({ to: "" }))).status).toBe(422);
    expect((await POST(message({ channel: "sms" }))).status).toBe(422);
    expect(sent).toHaveLength(0);
  });

  it("never attaches List-Unsubscribe to an invitation", async () => {
    // Access mail is unsubscribable through no header and no audience. Opting out of the message that
    // grants you access would leave you unable to accept the invitation.
    for (const templateCode of ["resident_invitation", "staff_invitation", "owner_invitation"]) {
      sent = [];
      await POST(message({ templateCode }));
      expect(payload().headers, templateCode).toBeUndefined();
    }
  });

  it("attaches List-Unsubscribe to category mail, at the recipient audience's own origin", async () => {
    // `sender.test.ts` asserts each of these paths is one routeForHost actually serves on that host.
    await POST(message({ templateCode: "announcement_published" }));
    expect(payload().headers["List-Unsubscribe"]).toBe("<https://crecyliving.com/more/preferences>");

    sent = [];
    await POST(message({ templateCode: "conversation_message_received" }));
    expect(payload().headers["List-Unsubscribe"]).toBe("<https://crecyliving.com/more/preferences>");
  });

  it("omits List-Unsubscribe on category mail whose recipient surface is ambiguous", async () => {
    // document_delivered is category mail whose recipient is a resident OR an owner. With no resolved
    // audience the relay cannot name an honest preference page, so it omits the header rather than
    // pointing a resident at an operator sign-in they cannot pass.
    await POST(message({ templateCode: "document_delivered" }));
    expect(payload().headers).toBeUndefined();
  });

  it("resolves a resident List-Unsubscribe for document_delivered once the audience is known", async () => {
    // The worker resolves document_delivered's audience from recipient_relationship_type and passes it,
    // so a delivery to a resident carries a resident unsubscribe link, not none and not an operator one.
    await POST(message({ templateCode: "document_delivered", audience: "resident" }));
    expect(payload().headers?.["List-Unsubscribe"]).toContain("crecyliving.com/more/preferences");
  });

  it("resolves an owner List-Unsubscribe for document_delivered once the audience is known", async () => {
    await POST(message({ templateCode: "document_delivered", audience: "owner" }));
    expect(payload().headers?.["List-Unsubscribe"]).toContain("owner.crecyos.com/owner/preferences");
    expect(payload().from).toContain("@mail.crecyos.com");
  });

  it("does not offer RFC 8058 one-click unsubscribe", async () => {
    // List-Unsubscribe-Post would need an endpoint that opts a recipient out with no session, which is
    // a way around the sign-in these per-user preferences are scoped by. The link goes to the page.
    await POST(message({ templateCode: "announcement_published" }));
    expect(payload().headers["List-Unsubscribe-Post"]).toBeUndefined();
  });
});

describe("relay audience handling", () => {
  it("honors a resolved audience over the template default", async () => {
    await POST(message({ templateCode: "document_delivered", audience: "resident" }));
    expect(payload().from).toContain("@mail.crecyliving.com");
  });

  it("ignores an audience it does not recognize", async () => {
    // The body is authenticated but still untrusted: a caller must not be able to name a brand.
    await POST(message({ templateCode: "document_delivered", audience: "not-a-real-audience" }));
    expect(payload().from).toMatch(/^Crecy </);
  });

  it("omits List-Unsubscribe entirely when no origin resolves", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_LIVING_ROOT_DOMAIN", "");
    await POST(message({ templateCode: "announcement_published" }));
    // A relative List-Unsubscribe is a malformed header, not a degraded one.
    expect(payload().headers).toBeUndefined();
  });
});
