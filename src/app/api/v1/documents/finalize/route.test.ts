import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), download: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser }, storage: { from: () => ({ download: mocks.download }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { POST } from "./route";
const grantId = "90000000-0000-4000-8000-000000000009", checksum = "a".repeat(64);
const request = () => new Request("https://app.crecyos.com/api/v1/documents/finalize", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": grantId }, body: JSON.stringify({ grantId, sha256Hex: checksum }) });
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: "actor" } }, error: null }); });
describe("finalized upload receipt recovery", () => {
  it("returns the original receipt before inspecting an already-used grant", async () => {
    const receipt = { documentId: "60000000-0000-4000-8000-000000000006", versionId: "50000000-0000-4000-8000-000000000005", scanStatus: "quarantined", recovered: true };
    mocks.rpc.mockResolvedValue({ data: receipt, error: null });
    const response = await POST(request()); expect(response.status).toBe(201); expect(await response.json()).toEqual(receipt);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.rpc).toHaveBeenCalledWith("recover_document_upload", { p_grant_id: grantId, p_sha256_hex: checksum });
    expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not recover without a signed-in actor", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(request())).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("refuses another actor's upload and never switches to an admin read", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "UPLOAD_GRANT_NOT_FOUND" } });
    expect((await POST(request())).status).toBe(403); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("distinguishes mismatched content from a retryable database outage", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "UPLOAD_CHECKSUM_CONFLICT" } })
      .mockResolvedValueOnce({ data: null, error: { code: "08006", message: "database unavailable" } });
    expect((await POST(request())).status).toBe(409); expect((await POST(request())).status).toBe(502);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("keeps verification required when an upload has not been finalized", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: { message: "UPLOAD_GRANT_EXPIRED" } });
    expect((await POST(request())).status).toBe(422);
    expect(mocks.rpc.mock.calls[1][0]).toBe("inspect_document_upload_grant"); expect(mocks.admin).not.toHaveBeenCalled();
  });
});
