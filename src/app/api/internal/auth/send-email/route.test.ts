import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import { POST } from "./route";

/**
 * The Supabase Send Email Auth Hook, exercised as a route.
 *
 * `standard-webhooks.test.ts` proves the signature primitive. These tests prove the BOUNDARY: that an
 * unsigned request cannot make Crecy send mail, that a replayed one cannot either, that a failure
 * returns non-2xx (Supabase reads a 2xx as "delivered" and will not retry), and that no token ever
 * reaches a response body or a provider idempotency key.
 */
const SECRET_BYTES = randomBytes(24);
const SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;
let sent: { url: string; init: RequestInit }[] = [];

function resendReplies(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }));
}

function sign(id: string, timestamp: string, payload: string): string {
  return `v1,${createHmac("sha256", SECRET_BYTES).update(`${id}.${timestamp}.${payload}`).digest("base64")}`;
}

type HookOptions = {
  user?: Record<string, unknown>;
  emailData?: Record<string, unknown>;
  id?: string;
  timestamp?: number;
  signature?: string;
};

function hookRequest(options: HookOptions = {}) {
  const payload = JSON.stringify({
    user: { email: "person@example.com", ...options.user },
    email_data: {
      token: "123456",
      token_hash: "tokenhash0000000000current",
      redirect_to: "https://app.crecyos.com/settings/team/accept?token=abc",
      email_action_type: "magiclink",
      site_url: "https://app.crecyos.com",
      ...options.emailData,
    },
  });
  const id = options.id ?? "msg_1";
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  return new Request("https://app.crecyos.com/api/internal/auth/send-email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": options.signature ?? sign(id, timestamp, payload),
    },
    body: payload,
  });
}

/** Every message the route handed to the provider, in order. */
function messages() {
  return sent.map((call) => JSON.parse(String(call.init.body)) as Record<string, unknown>);
}

/** The addresses each message went to, flattened — Resend's `to` is an array even for one recipient. */
function recipients() {
  return messages().flatMap((m) => (Array.isArray(m.to) ? (m.to as string[]) : [String(m.to)]));
}

beforeEach(() => {
  sent = [];
  vi.stubEnv("SUPABASE_AUTH_HOOK_SECRET", SECRET);
  vi.stubEnv("RESEND_API_KEY", "re_test_key_value");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.crecyos.com");
  vi.stubEnv("NEXT_PUBLIC_MARKETING_ORIGIN", "https://crecyos.com");
  vi.stubEnv("NEXT_PUBLIC_LIVING_ROOT_DOMAIN", "crecyliving.com");
  resendReplies(200, { id: "resend-1" });
});
afterEach(() => vi.unstubAllGlobals());

describe("the Supabase Send Email Auth Hook", () => {
  it("sends a Crecy-rendered message for a correctly signed request", async () => {
    const response = await POST(hookRequest());
    expect(response.status).toBe(200);
    expect(messages()).toHaveLength(1);
    const message = messages()[0];
    expect(recipients()).toEqual(["person@example.com"]);
    expect(String(message.html)).toContain("<!doctype html>");
    // The link points at Crecy's own redemption endpoint, never at a Supabase URL.
    expect(String(message.html)).toContain("https://app.crecyos.com/auth/confirm?token_hash=");
    expect(String(message.html)).not.toContain("/auth/v1/verify");
  });

  it("refuses an unsigned request and sends nothing", async () => {
    const response = await POST(hookRequest({ signature: "v1,not-a-real-signature" }));
    expect(response.status).toBe(401);
    expect(sent, "a forged request reached the mail provider").toHaveLength(0);
  });

  it("refuses a replayed request whose timestamp has aged out", async () => {
    // Standard Webhooks bounds the timestamp precisely so a captured body cannot be replayed forever.
    const response = await POST(hookRequest({ timestamp: Math.floor(Date.now() / 1000) - 3600 }));
    expect(response.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("fails loudly rather than silently when the secret is not configured", async () => {
    // A 401 here would look to the operator like Supabase sending a bad signature. A 500 says the
    // endpoint is broken, which is the truth, and Supabase retries instead of discarding the mail.
    vi.stubEnv("SUPABASE_AUTH_HOOK_SECRET", "");
    const response = await POST(hookRequest());
    expect(response.status).toBe(500);
    expect(sent).toHaveLength(0);
  });

  it("never returns 2xx when the send failed", async () => {
    // Supabase reads a 2xx as "this email was delivered". Returning one after a failed send makes a
    // password reset vanish with no retry and no trace.
    resendReplies(500, { message: "upstream" });
    const response = await POST(hookRequest());
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("puts no token in the response body on any failure path", async () => {
    resendReplies(422, { message: "rejected" });
    const response = await POST(hookRequest());
    const text = await response.text();
    expect(text).not.toContain("tokenhash0000000000current");
    expect(text).not.toContain("123456");
  });

  it("uses the webhook id, not the token, as the provider idempotency key", async () => {
    // An idempotency key is echoed in provider dashboards and logs, so a token must never be one.
    await POST(hookRequest());
    const headers = sent[0].init.headers as Record<string, string>;
    const key = headers["Idempotency-Key"] ?? headers["idempotency-key"];
    expect(key).toContain("msg_1");
    expect(key).not.toContain("tokenhash0000000000current");
  });

  it("carries only the PATH of redirect_to, so the hook cannot choose the destination", async () => {
    const response = await POST(hookRequest({
      emailData: { redirect_to: "https://evil.example.com/steal?a=1" },
    }));
    expect(response.status).toBe(200);
    const html = String(messages()[0].html);
    expect(html, "an attacker-chosen origin reached the link").not.toContain("evil.example.com");
    expect(html).toContain("next=%2Fsteal");
  });

  it("rejects an action type it does not know", async () => {
    const response = await POST(hookRequest({ emailData: { email_action_type: "something_new" } }));
    expect(response.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("sends a security notification with no link at all", async () => {
    const response = await POST(hookRequest({ emailData: { email_action_type: "password_changed_notification" } }));
    expect(response.status).toBe(200);
    const html = String(messages()[0].html);
    expect(html).not.toContain("/auth/confirm");
    expect(html, "a notification rendered something to click").not.toContain("</a>");
  });

  describe("email_change, where the field names are reversed", () => {
    // Supabase pairs `token_hash_new` with the CURRENT address and `token_hash` with the NEW one, for
    // backward compatibility. Reading them at face value sends each recipient a token that only
    // validates the other address — and, before this, sent the new address nothing whatsoever.
    const secureChange = {
      user: { email: "old@example.com", new_email: "new@example.com" },
      emailData: {
        email_action_type: "email_change",
        token_hash: "hashfornewaddress00000000",
        token_hash_new: "hashforcurrentaddress0000",
        token: "111111",
        token_new: "222222",
      },
    };

    it("emails both addresses", async () => {
      const response = await POST(hookRequest(secureChange));
      expect(response.status).toBe(200);
      expect(recipients()).toEqual(["old@example.com", "new@example.com"]);
    });

    it("gives each address the hash that verifies THAT address", async () => {
      await POST(hookRequest(secureChange));
      const [current, next] = messages().map((m) => String(m.html));
      expect(current, "current address").toContain("token_hash=hashforcurrentaddress0000");
      expect(current, "current address got the new address's hash").not.toContain("hashfornewaddress00000000");
      expect(next, "new address").toContain("token_hash=hashfornewaddress00000000");
      expect(next, "new address got the current address's hash").not.toContain("hashforcurrentaddress0000");
    });

    it("gives the two messages distinct idempotency keys", async () => {
      // One webhook id covers two DIFFERENT messages. Sharing a key makes the provider treat the
      // second as a duplicate of the first and drop it, so only one address is ever reachable.
      await POST(hookRequest(secureChange));
      const keys = sent.map((call) => {
        const headers = call.init.headers as Record<string, string>;
        return headers["Idempotency-Key"] ?? headers["idempotency-key"];
      });
      expect(new Set(keys).size, "the two messages shared an idempotency key").toBe(2);
    });

    it("sends only the new address when secure email change is off", async () => {
      // With the setting off there is one OTP and no `token_hash_new`, so there is nothing for the
      // current address to confirm and no message to send it.
      await POST(hookRequest({
        user: { email: "old@example.com", new_email: "new@example.com" },
        emailData: { email_action_type: "email_change", token_hash: "hashfornewaddress00000000", token_hash_new: "" },
      }));
      expect(recipients()).toEqual(["new@example.com"]);
    });
  });
});
