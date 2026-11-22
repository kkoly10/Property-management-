import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/organization/context", () => ({ getOrganizationContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } }),
}));

import { POST } from "./route";

const ORG = "91000000-0000-4000-8000-000000000091";
const LISTING = "93000000-0000-4000-8000-000000000093";
const PUBLIC = "94000000-0000-4000-8000-000000000094";

function request(visibility: "unlisted" | "discoverable" = "discoverable") {
  return new Request("https://app.crecyos.com/api/v1/rental-listings/visibility", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "visibility-operation-key" },
    body: JSON.stringify({ organizationId: ORG, listingId: LISTING, expectedVersion: 3, visibility }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({
    state: "active",
    active: { organizationId: ORG, customerPath: "self_managing" },
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "actor" } }, error: null });
});

describe("rental listing discovery visibility route", () => {
  it("accepts an exact advancing discovery receipt", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        listingId: LISTING, publicId: PUBLIC, status: "published",
        visibility: "discoverable", version: 4, discoveredAt: "2026-10-09T20:05:00Z",
      },
      error: null,
    });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("set_rental_listing_visibility", {
      p_organization_id: ORG,
      p_listing_id: LISTING,
      p_expected_version: 3,
      p_visibility: "discoverable",
      p_idempotency_key: "visibility-operation-key",
    });
  });

  it("fails closed on a mismatched or nonadvancing receipt", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        listingId: LISTING, publicId: PUBLIC, status: "published",
        visibility: "unlisted", version: 3, discoveredAt: null,
      },
      error: null,
    });

    const response = await POST(request());
    expect(response.status).toBe(502);
  });

  it("rejects a workspace mismatch before the database command", async () => {
    mocks.context.mockResolvedValue({
      state: "active",
      active: {
        organizationId: "99000000-0000-4000-8000-000000000099",
        customerPath: "self_managing",
      },
    });

    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("accepts explicit removal from discovery only with a null discovery timestamp", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        listingId: LISTING, publicId: PUBLIC, status: "published",
        visibility: "unlisted", version: 4, discoveredAt: null,
      },
      error: null,
    });

    const response = await POST(request("unlisted"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      listingId: LISTING, visibility: "unlisted", discoveredAt: null,
    });
  });
});
