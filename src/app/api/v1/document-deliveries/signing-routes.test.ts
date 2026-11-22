import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./[deliveryId]/download/route";
import { POST } from "./[deliveryId]/signature/route";

const bindings = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUrl: vi.fn(),
  signingWrite: vi.fn(),
}));
const disclosure = "esign_consent@1.0.0#260463bcf84a7827";
const actor = "20000000-0000-4000-8000-000000000001";
const org = "20000000-0000-4000-8000-000000000002";
const deliveryId = "20000000-0000-4000-8000-000000000003";
const versionId = "20000000-0000-4000-8000-000000000004";
const args = { params: Promise.resolve({ deliveryId }) };

vi.mock("@/lib/data/signatures", () => ({
  resolveEsignConsent: () => ({ version: disclosure }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: bindings.getUser },
    from: bindings.from,
    storage: { from: bindings.storageFrom },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: bindings.signingWrite }),
}));

function setupPinnedVersion(status = "delivered", expiresAt: string | null = null, signed = false) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        document_version_id: versionId,
        status,
        expires_at: expiresAt,
        document_versions: {
          storage_bucket: "private-documents",
          storage_path: "original-delivered-version.pdf",
          original_filename: "delivered-lease.pdf",
          upload_status: "clean",
        },
        document_signatures: signed ? [{ id: "retained-signature" }] : [],
      },
    }),
  };
  bindings.from.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  bindings.getUser.mockResolvedValue({ data: { user: { id: actor } } });
  bindings.storageFrom.mockReturnValue({ createSignedUrl: bindings.createSignedUrl });
  bindings.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.example.com/pinned-version" } });
  bindings.signingWrite.mockResolvedValue({ data: { signatureId: "signature-receipt" } });
});

describe("pinned delivery download", () => {
  it("signs exactly the stored version path and scopes the delivery to the requester", async () => {
    const query = setupPinnedVersion();
    const response = await GET(new Request("https://crecy.example/download?version=" + versionId), args);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://storage.example.com/pinned-version");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(query.eq.mock.calls).toEqual([["id", deliveryId], ["recipient_user_id", actor]]);
    expect(bindings.createSignedUrl).toHaveBeenCalledWith("original-delivered-version.pdf", 60, { download: "delivered-lease.pdf" });
  });

  it("never signs a storage URL if the displayed version changed or the delivery was revoked", async () => {
    setupPinnedVersion();
    expect((await GET(new Request("https://crecy.example/download?version=older"), args)).status).toBe(409);
    setupPinnedVersion("revoked");
    expect((await GET(new Request("https://crecy.example/download"), args)).status).toBe(404);
    expect(bindings.createSignedUrl).not.toHaveBeenCalled();
  });

  it("denies an expired unsigned delivery and preserves a completed historical copy", async () => {
    setupPinnedVersion("sent", "2000-01-01T00:00:00Z");
    expect((await GET(new Request("https://crecy.example/download"), args)).status).toBe(404);
    setupPinnedVersion("revoked", "2000-01-01T00:00:00Z", true);
    expect((await GET(new Request("https://crecy.example/download"), args)).status).toBe(303);
    expect(bindings.createSignedUrl).toHaveBeenCalledTimes(1);
  });
});

describe("trusted signature route", () => {
  const payload = {
    organizationId: org, esignConsentVersion: disclosure, reviewedVersionId: versionId,
    reviewedSha256: "a".repeat(64), signerName: "Fixture Signer", documentReviewConfirmed: true,
    esignConsentAgreed: true, intentAffirmed: true,
  };
  const request = (body: object) => new Request("https://crecy.example/signature", {
    method: "POST",
    headers: { "idempotency-key": "stable-sign-request", "user-agent": "Untrusted", "x-forwarded-for": "192.0.2.2" },
    body: JSON.stringify(body),
  });

  it("uses the session actor and published binding, omitting caller attribution", async () => {
    const response = await POST(request({ ...payload, actorUserId: org, intentStatement: "Caller supplied" }), args);
    expect(response.status).toBe(201);
    expect(bindings.signingWrite).toHaveBeenCalledExactlyOnceWith("sign_reviewed_document", {
      p_actor_user_id: actor, p_organization_id: org, p_document_delivery_id: deliveryId,
      p_reviewed_version_id: versionId, p_reviewed_sha256: payload.reviewedSha256,
      p_signer_name: payload.signerName, p_esign_consent_version: disclosure,
      p_idempotency_key: "stable-sign-request",
    });
  });

  it("rejects stale disclosure and absent review before invoking the guarded writer", async () => {
    expect((await POST(request({ ...payload, esignConsentVersion: "wrong" }), args)).status).toBe(409);
    expect((await POST(request({ ...payload, documentReviewConfirmed: false }), args)).status).toBe(400);
    expect(bindings.signingWrite).not.toHaveBeenCalled();
  });
});
