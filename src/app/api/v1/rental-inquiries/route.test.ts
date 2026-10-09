import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));

import { POST } from "./route";

const publicId = "81000000-0000-4000-8000-000000000081";
const secret = "inquiry-test-secret-that-is-at-least-32-characters-long";
function request(ip: string | null = "203.0.113.9", realIp?: string) {
  return new Request("https://rent.crecyos.com/api/v1/rental-inquiries", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "inquiry-route-test-key",
      ...(ip === null ? {} : { "x-forwarded-for": ip }),
      ...(realIp ? { "x-real-ip": realIp } : {}),
    },
    body: JSON.stringify({
      publicId,
      firstName: "Jamie",
      lastName: "Renter",
      email: "jamie@example.com",
      question: "Is water included in the monthly rent?",
      locale: "en-US",
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RENTAL_INQUIRY_RATE_LIMIT_SECRET", secret);
  mocks.rpc.mockResolvedValue({ data: { accepted: true }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("public rental inquiry route", () => {
  it("sends only a keyed network hash to the database", async () => {
    const response = await POST(request());
    expect(response.status).toBe(202);
    const expected = createHmac("sha256", secret)
      .update("rental-inquiry-ip:203.0.113.9")
      .digest("hex");
    expect(mocks.rpc).toHaveBeenCalledWith("submit_public_rental_inquiry", expect.objectContaining({
      p_public_id: publicId,
      p_network_hash: expected,
      p_email: "jamie@example.com",
    }));
    expect(JSON.stringify(mocks.rpc.mock.calls[0][1])).not.toContain("203.0.113.9");
  });

  it.each([
    [null, "198.51.100.23"],
    ["unknown", "198.51.100.23"],
    ["198.51.100.2;spoofed", "198.51.100.23"],
  ])("fails closed in production for an invalid forwarded source (%s), even with X-Real-IP", async (forwarded, realIp) => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request(forwarded, realIp));
    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("hashes a valid IPv6 edge source without retaining the raw IP", async () => {
    const source = "2001:db8::1234";
    const response = await POST(request(source, "198.51.100.23"));
    expect(response.status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("submit_public_rental_inquiry", expect.objectContaining({
      p_network_hash: createHmac("sha256", secret)
        .update(`rental-inquiry-ip:${source}`).digest("hex"),
    }));
    expect(JSON.stringify(mocks.rpc.mock.calls[0][1])).not.toContain(source);
  });

  it("fails closed when the server-only rate key is not configured", async () => {
    vi.stubEnv("RENTAL_INQUIRY_RATE_LIMIT_SECRET", "replace_me");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns a neutral accepted response for the database's accepted envelope", async () => {
    const response = await POST(request());
    expect(await response.json()).toEqual({
      accepted: true,
      message: "Check your email to verify your question before it is shared.",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("fails closed when the listing stopped accepting questions", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "LISTING_NOT_AVAILABLE" },
    });
    const response = await POST(request());
    expect(response.status).toBe(404);
  });
});
