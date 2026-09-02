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

  it("rejects a malformed message without calling the provider", async () => {
    expect((await POST(message({ to: "" }))).status).toBe(422);
    expect((await POST(message({ channel: "sms" }))).status).toBe(422);
    expect(sent).toHaveLength(0);
  });

  it("never attaches List-Unsubscribe to an invitation, but does to category mail", async () => {
    await POST(message({ templateCode: "resident_invitation" }));
    expect(payload().headers).toBeUndefined();

    sent = [];
    await POST(message({ templateCode: "announcement_published" }));
    expect(payload().headers["List-Unsubscribe"]).toBe("<https://crecyliving.com/more/preferences>");
  });
});
