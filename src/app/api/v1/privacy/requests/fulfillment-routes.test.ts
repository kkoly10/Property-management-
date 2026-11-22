import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./[privacyRequestId]/account-export/route";
import { POST } from "./[privacyRequestId]/outcome/route";

const bindings = vi.hoisted(() => ({
  getUser: vi.fn(),
  getActiveOrganizationId: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: bindings.getUser }, rpc: bindings.rpc }),
}));
vi.mock("@/lib/organization/context", () => ({ getActiveOrganizationId: bindings.getActiveOrganizationId }));

const id = "20000000-0000-4000-8000-000000000002";
const organization = "20000000-0000-4000-8000-000000000003";
const url = "https://app.crecyos.com/api/v1/privacy/requests/" + id;
const context = { params: Promise.resolve({ privacyRequestId: id }) };
const submit = (details = {}) => POST(new Request(url + "/outcome", {
  method: "POST",
  body: JSON.stringify({
    expectedVersion: 1, outcome: "denied", requesterMessage: "A review was recorded.", reviewReference: "CASE-1",
    ...details,
  }),
  headers: { "Content-Type": "application/json", "Idempotency-Key": "request-outcome-test" },
}), context);

beforeEach(() => {
  vi.resetAllMocks();
  bindings.getUser.mockResolvedValue({ data: { user: { id: "authenticated" } }, error: null });
  bindings.getActiveOrganizationId.mockResolvedValue(organization);
});

describe("privacy fulfillment routes", () => {
  it("returns the exact requester projection as a private attachment", async () => {
    const exportFile = { formatVersion: 1, scope: "crecy_platform_account", privacyRequestId: id };
    bindings.rpc.mockResolvedValueOnce({ data: exportFile, error: null });
    const response = await GET(new Request(url + "/account-export"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="crecy-account-export.json"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(exportFile);
    expect(bindings.rpc).toHaveBeenCalledWith("get_own_privacy_account_export", { p_privacy_request_id: id });
  });

  it("fails closed for foreign accounts and sessions without an authenticator", async () => {
    bindings.rpc.mockResolvedValueOnce({ data: null, error: { message: "PRIVACY_EXPORT_NOT_FOUND" } });
    const foreign = await GET(new Request(url + "/account-export"), context);
    expect(foreign.status).toBe(404);
    expect(foreign.headers.get("cache-control")).toBe("private, no-store");
    bindings.rpc.mockResolvedValueOnce({ data: null, error: { message: "MFA_STEP_UP_REQUIRED" } });
    expect((await GET(new Request(url + "/account-export"), context)).status).toBe(403);
  });

  it("derives the review workspace from the selected context", async () => {
    bindings.rpc.mockResolvedValueOnce({ data: { privacyRequestId: id, status: "denied" }, error: null });
    const response = await submit({ organizationId: id });
    expect(response.status).toBe(200);
    expect(bindings.rpc).toHaveBeenCalledWith("record_operator_privacy_outcome", {
      p_organization_id: organization, p_privacy_request_id: id, p_expected_version: 1, p_outcome: "denied",
      p_requester_message: "A review was recorded.", p_review_reference: "CASE-1", p_idempotency_key: "request-outcome-test",
    });
  });

  it("requires a selected workspace and keeps protected outcomes restricted", async () => {
    bindings.getActiveOrganizationId.mockResolvedValueOnce(null);
    expect((await submit()).status).toBe(404);
    expect(bindings.rpc).not.toHaveBeenCalled();
    bindings.rpc.mockResolvedValueOnce({ data: null, error: { message: "PRIVACY_FULL_FULFILLMENT_UNAVAILABLE" } });
    expect((await submit({ outcome: "fulfilled" })).status).toBe(409);
  });
});
