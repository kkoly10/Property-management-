import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));

import { POST } from "./route";

const token = "a".repeat(64);
function request(value = token) {
  return new Request("https://rent.crecyos.com/api/v1/rental-inquiries/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: value }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("rental inquiry verification route", () => {
  it("does not call the database for malformed credentials", async () => {
    const response = await POST(request("bad"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      verified: false,
      message: "This verification link is invalid or expired.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns only a generic invalid response for an unknown or expired credential", async () => {
    mocks.rpc.mockResolvedValue({ data: { verified: false }, error: null });
    const response = await POST(request());
    expect(await response.json()).toEqual({
      verified: false,
      message: "This verification link is invalid or expired.",
    });
  });

  it("returns the verified reference without exposing contact data", async () => {
    mocks.rpc.mockResolvedValue({
      data: { verified: true, inquiryReference: "INQ-ABC123", status: "open" },
      error: null,
    });
    const response = await POST(request());
    const body = await response.json();
    expect(body).toEqual({
      verified: true,
      inquiryReference: "INQ-ABC123",
      status: "open",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("verify_public_rental_inquiry", { p_token: token });
  });
});
