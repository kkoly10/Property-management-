import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendViaResend } from "./resend";

const message = {
  from: "Crecy <notify@example.invalid>",
  to: "fixture@example.invalid",
  subject: "Worker fixture",
  text: "Notification",
  html: "<p>Notification</p>",
  idempotencyKey: "fixture-job-123",
};

beforeEach(() => vi.stubEnv("RESEND_API_KEY", "fixture-key"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Resend acknowledgements", () => {
  it.each([{}, { id: "" }, { id: "   " }, { id: 42 }, { id: "x".repeat(201) }])(
    "treats an unusable success acknowledgement as a retryable failure",
    async (body) => {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
      expect(await sendViaResend(message)).toMatchObject({
        ok: false, code: "MAIL_PROVIDER_RECEIPT_MISSING", retryable: true,
      });
    },
  );

  it("retains an authoritative receipt and supplies the stable message key", async () => {
    const fetchProvider = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => Response.json({ id: "fixture-receipt" }),
    );
    vi.stubGlobal("fetch", fetchProvider);
    expect(await sendViaResend(message)).toEqual({ ok: true, messageId: "fixture-receipt" });
    expect(fetchProvider.mock.calls[0][1].headers).toMatchObject({ "Idempotency-Key": "fixture-job-123" });
  });
});
