import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

const secretBytes = Buffer.from("Test-only delivery receipt signature key.");
const secret = "whsec_" + secretBytes.toString("base64");
const eventId = "msg_crecy_delivery-test";
const emailId = "50000000-0000-4000-8000-000000000005";
const occurredAt = "2026-11-23T05:50:00.125Z";
const event = (type: string) => JSON.stringify({
  type, created_at: occurredAt,
  data: {
    email_id: emailId, message_id: "<different@example.test>",
    to: ["synthetic@example.test"], from: "sender@example.test", subject: "Test receipt – UTF-8",
    tags: { privacy_probe: "not-stored" },
  },
}, null, 2);

function request(payload: string, options: { offset?: number; tampered?: boolean; query?: string } = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000) + (options.offset ?? 0));
  const signature = createHmac("sha256", secretBytes).update(`${eventId}.${timestamp}.${payload}`, "utf8").digest("base64");
  return new Request("https://app.crecyos.com/api/internal/providers/resend/webhook" + (options.query ?? ""), {
    method: "POST",
    headers: {
      "svix-id": eventId, "svix-timestamp": timestamp,
      "svix-signature": `v1,invalid v2,other v1,${signature}`,
    },
    body: options.tampered ? payload + " " : payload,
  });
}

beforeEach(() => {
  vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  ["email.delivered", "delivered"],
  ["email.delivery_delayed", "delayed"],
  ["email.bounced", "bounced"],
])("verifies the raw signed %s receipt and forwards only correlation fields", async (type, status) => {
  const response = await POST(request(event(type)));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ received: true });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("record_resend_notification_event", {
    p_event_id: eventId, p_provider_message_id: emailId, p_status: status,
    p_occurred_at: occurredAt,
  });
});

it("acknowledges deduplicated replays", async () => {
  rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await POST(request(event("email.delivered")))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("record_resend_notification_event", expect.objectContaining({
    p_provider_message_id: emailId,
  }));
});

it("ignores other signed webhook types without writing metadata", async () => {
  expect((await POST(request(event("email.opened")))).status).toBe(200);
  expect((await POST(request(JSON.stringify({ type: "email.received" })))).status).toBe(200);
  expect(rpc).not.toHaveBeenCalled();
});

it("rejects tampering, expired timestamps, future timestamps and URL credentials before ingest", async () => {
  const payload = event("email.delivered");
  expect((await POST(request(payload, { tampered: true }))).status).toBe(401);
  expect((await POST(request(payload, { offset: -600 }))).status).toBe(401);
  expect((await POST(request(payload, { offset: 600 }))).status).toBe(401);
  expect((await POST(request(payload, { query: "?secret=synthetic" }))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

it("rejects invalid payloads and caps body bytes even without a content-length header", async () => {
  expect((await POST(request("{broken JSON"))).status).toBe(400);
  expect((await POST(request(JSON.stringify({
    type: "email.delivered", created_at: occurredAt, data: { email_id: "not-the-api-id" },
  })))).status).toBe(400);
  expect((await POST(request("x".repeat(128 * 1024 + 1)))).status).toBe(413);
  expect(rpc).not.toHaveBeenCalled();
});

it("asks Resend to retry if receipt intake is unavailable", async () => {
  const payload = event("email.delivered");
  rpc.mockResolvedValueOnce({ data: null, error: { code: "DB_OFFLINE" } });
  expect((await POST(request(payload))).status).toBe(503);
  rpc.mockResolvedValueOnce({ data: null, error: null });
  expect((await POST(request(payload))).status).toBe(503);
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
  expect((await POST(request(payload))).status).toBe(503);
});
