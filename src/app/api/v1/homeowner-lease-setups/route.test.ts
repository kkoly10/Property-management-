import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), context: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/organization/context", () => ({ getOrganizationContext: mocks.context }));
import { GET, POST } from "./route";
import { POST as activate } from "./activate/route";
import { leaseFixture, leaseOrg, leaseUnit } from "@/lib/validation/homeowner-lease.fixture";
const setupId = leaseFixture().setupId;
const request = (body: unknown) => new Request("https://app.crecyos.com/api/v1/homeowner-lease-setups", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "90000000-0000-4000-8000-000000000009" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: "actor" } }, error: null });
  mocks.context.mockResolvedValue({ state: "active", active: { organizationId: leaseOrg, customerPath: "self_managing" } }); mocks.rpc.mockResolvedValue({ data: leaseFixture(), error: null }); });
describe("homeowner saved-lease boundary", () => {
  it("reads only the explicit organization/unit with private no-store responses", async () => {
    const response = await GET(new Request(`https://app.crecyos.com/api/v1/homeowner-lease-setups?organizationId=${leaseOrg}&unitId=${leaseUnit}`));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("get_homeowner_lease_episode", { p_organization_id: leaseOrg, p_unit_id: leaseUnit, p_setup_id: null, p_application_id: null, p_new: false });
  });
  it("rejects conflicting episode selectors before dispatch", async () => {
    const response = await GET(new Request(`https://app.crecyos.com/api/v1/homeowner-lease-setups?organizationId=${leaseOrg}&unitId=${leaseUnit}&setupId=${setupId}&new=1`));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not write after the selected workspace changes", async () => {
    mocks.context.mockResolvedValue({ state: "active", active: { organizationId: "different", customerPath: "self_managing" } });
    expect((await POST(request({ organizationId: leaseOrg, unitId: leaseUnit, setupId, expectedRevision: 3, draft: leaseFixture().draft }))).status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires authentication before draft reads", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET(new Request(`https://app.crecyos.com/api/v1/homeowner-lease-setups?organizationId=${leaseOrg}&unitId=${leaseUnit}`))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("activation accepts saved revision and confirmations, never replacement financial payloads", async () => {
    const body = { organizationId: leaseOrg, unitId: leaseUnit, setupId, expectedRevision: 4, openingConfirmed: true, agreementConfirmed: true };
    expect((await activate(request({ ...body, rentAmount: 1 }))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await activate(request(body))).status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("activate_homeowner_lease_episode", { p_organization_id: leaseOrg, p_unit_id: leaseUnit, p_setup_id: setupId, p_expected_revision: 4, p_opening_confirmed: true, p_agreement_confirmed: true });
  });
  it("keeps uncertain failures distinguishable from transactional refusals", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection lost" } });
    expect((await POST(request({ organizationId: leaseOrg, unitId: leaseUnit, setupId, expectedRevision: 3, draft: leaseFixture().draft }))).status).toBe(502);
  });
});
