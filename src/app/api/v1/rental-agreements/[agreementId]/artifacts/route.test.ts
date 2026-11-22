import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  session: vi.fn(),
  rpc: vi.fn(),
  signedUrl: vi.fn(),
  admin: vi.fn(),
}));

vi.mock("@/lib/data/rental-agreements", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/data/rental-agreements")>(),
  getAgreementSession: dependencies.session,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: dependencies.admin,
}));

import { GET } from "./route";

const agreementId = "85000000-0000-4000-8000-000000000085";
const organizationId = "86000000-0000-4000-8000-000000000086";
const unitId = "87000000-0000-4000-8000-000000000087";
const versionId = "88000000-0000-4000-8000-000000000088";
const source = {
  bucket: "private-documents", path: "organizations/" + organizationId + "/unit/" + unitId + "/" + versionId + "/source.pdf",
  filename: "source.pdf", versionId, sha256: "a".repeat(64),
};
const responseBody = '{"signer":"Elisa Peña"}';
const evidenceSha256 = createHash("sha256").update(responseBody).digest("hex");

function get(kind: string, surface = "participant") {
  return GET(new Request("https://crecyliving.com/api/v1/rental-agreements/" + agreementId + "/artifacts?kind=" + kind + "&surface=" + surface),
    { params: Promise.resolve({ agreementId }) });
}

describe("rental agreement artifacts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dependencies.session.mockResolvedValue({ mode: "ready", organizationId: null, supabase: { rpc: dependencies.rpc } });
    dependencies.admin.mockReturnValue({ storage: { from: () => ({ createSignedUrl: dependencies.signedUrl }) } });
    dependencies.signedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.example/source" } });
  });

  it("returns private, immutable evidence bytes and the matching digest", async () => {
    dependencies.rpc.mockResolvedValue({ data: { source, evidenceText: responseBody, evidenceSha256 } });
    const response = await get("evidence");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(responseBody);
    expect(response.headers.get("x-evidence-sha256")).toBe(evidenceSha256);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(dependencies.rpc).toHaveBeenCalledWith("get_rental_agreement_artifacts", { p_agreement_id: agreementId, p_organization_id: null });
    expect(dependencies.admin).not.toHaveBeenCalled();
  });

  it("rejects tampered or unfinished evidence", async () => {
    dependencies.rpc.mockResolvedValueOnce({ data: { source, evidenceText: responseBody + " ", evidenceSha256 } })
      .mockResolvedValueOnce({ data: { source, evidenceText: null, evidenceSha256: null } });
    expect((await get("evidence")).status).toBe(502);
    expect((await get("evidence")).status).toBe(404);
  });

  it("signs only the exact scoped clean source after database authorization", async () => {
    dependencies.session.mockResolvedValue({ mode: "ready", organizationId, supabase: { rpc: dependencies.rpc } });
    dependencies.rpc.mockResolvedValue({ data: { source, evidenceText: null, evidenceSha256: null } });
    const response = await get("source", "operator");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://storage.example/source");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(dependencies.rpc).toHaveBeenCalledWith("get_rental_agreement_artifacts", { p_agreement_id: agreementId, p_organization_id: organizationId });
    expect(dependencies.signedUrl).toHaveBeenCalledWith(source.path, 60, { download: source.filename });
  });

  it("keeps unauthorized package IDs and unexpected storage locations private", async () => {
    dependencies.rpc.mockResolvedValueOnce({ error: { code: "42501" } })
      .mockResolvedValueOnce({ data: { source: { ...source, bucket: "untrusted" }, evidenceText: null, evidenceSha256: null } });
    expect((await get("source")).status).toBe(404);
    expect((await get("source")).status).toBe(502);
    expect(dependencies.admin).not.toHaveBeenCalled();
  });

  it("requires a verified session before any artifact lookup", async () => {
    dependencies.session.mockResolvedValue({ mode: "signedOut" });
    expect((await get("source")).status).toBe(401);
    expect(dependencies.rpc).not.toHaveBeenCalled();
  });
});
