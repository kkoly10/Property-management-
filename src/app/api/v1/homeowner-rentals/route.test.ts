import { beforeEach, describe, expect, it, vi } from "vitest";
import { rentalFixture } from "@/lib/validation/homeowner-rental.fixture";
const { rpc, getUser, context } = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), context: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc, auth: { getUser } }) }));
vi.mock("@/lib/organization/context", () => ({ getOrganizationContext: context }));
import { POST } from "./route";
const key = "b1000000-0000-4000-8000-000000000001";
const request = (operationKey: string | null = key) => new Request("http://localhost/api/v1/homeowner-rentals", {
  method: "POST", headers: { "content-type": "application/json", ...(operationKey ? { "idempotency-key": operationKey } : {}) }, body: JSON.stringify(rentalFixture),
});
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "actor" } }, error: null });
  context.mockResolvedValue({ state: "active", active: { organizationId: rentalFixture.organizationId, customerPath: "self_managing" } });
  rpc.mockResolvedValue({ data: { unitId: key }, error: null });
});
describe("homeowner creation API", () => {
  it("passes only validated details and the original operation key to the authenticated command", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(rpc).toHaveBeenCalledWith("create_homeowner_rental", { p_organization_id: rentalFixture.organizationId, p_details: { property: rentalFixture.property, space: rentalFixture.space }, p_idempotency_key: key });
  });
  it("requires a stable operation key rather than generating one on the server", async () => {
    expect((await POST(request(null))).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses unauthenticated creation", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(request())).status).toBe(401); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a changed workspace before calling the command", async () => {
    context.mockResolvedValue({ state: "active", active: { organizationId: key, customerPath: "self_managing" } });
    expect((await POST(request())).status).toBe(409); expect(rpc).not.toHaveBeenCalled();
  });
  it("does not treat a professional workspace as self-managing", async () => {
    context.mockResolvedValue({ state: "active", active: { organizationId: rentalFixture.organizationId, customerPath: "property_manager" } });
    expect((await POST(request())).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
  });
  it("distinguishes known rejection from an unconfirmed transient response", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23514", message: "PLAN_LIMIT_EXCEEDED" } });
    expect((await POST(request())).status).toBe(422);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "40001", message: "COMMAND_IN_PROGRESS" } });
    expect((await POST(request())).status).toBe(503);
  });
});
